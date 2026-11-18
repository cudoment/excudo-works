import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { workspace } from './helpers.mjs';
import { loadConfig } from '../src/config.mjs';
import { writeReport, gitActivity } from '../src/report.mjs';
import { syncEdits } from '../src/edits.mjs';
import { judgeComments } from '../src/judgment.mjs';
import { runPipeline, builtIn } from '../src/pipeline.mjs';
import * as backupModule from '../src/backup.mjs';
const { backup } = backupModule;
import { doctor } from '../src/doctor.mjs';
import { installSkillLinks, initWorkspace } from '../src/init.mjs';
import { gatherSkill, evaluate, skillNames } from '../src/skill-check.mjs';
import { pushGuard } from '../scripts/push-guard.mjs';
import * as release from '../scripts/release-check.mjs';
const activity = { commits: [], warnings: [] };
const read = file => readFileSync(file, 'utf8');
const git = (root, args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
function commit(root) {
  git(root, ['init']); git(root, ['add', '.']);
  const result = git(root, ['-c', 'user.name=Fixture Owner', '-c', 'user.email=fixture.invalid', 'commit', '-m', 'Set up fixture']); assert.equal(result.status, 0, result.stderr);
}
async function edited(t, works = {}) {
  const ws = await workspace(t, works), page = join(ws.graph, 'Plan.md'), file = join(ws.root, 'weekly.md');
  writeFileSync(page, '- DOING Draft plan\n'); await writeReport(ws, { activity });
  writeFileSync(file, read(file).replace('Draft plan', 'Outline plan')); return { ws, page, file };
}
test('A1/C1/A9: scheduled edits save only kit-written files before later idle checks', async t => {
  const marker = 'later-ran';
  const { ws, page } = await edited(t, { idle: true, disabled: ['sources', 'skills', 'queue'], steps: [{ id: 'reflect', command: [process.execPath, '-e', `require('node:fs').writeFileSync('${marker}','yes')`] }] });
  writeFileSync(join(ws.root, '.gitignore'), '.excudo/\n.fake-engine-calls\nfake-engine.json\n'); writeFileSync(join(ws.root, 'owner.txt'), 'original'); commit(ws.root);
  writeFileSync(join(ws.root, 'owner.txt'), 'staged owner change'); git(ws.root, ['add', 'owner.txt']); writeFileSync(join(ws.root, 'fake-engine.json'), '{"checkDirty":true}');
  const result = await runPipeline(ws); assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(read(page), '- DOING Outline plan\n'); assert.ok(existsSync(join(ws.root, marker)));
  const calls = read(join(ws.root, '.fake-engine-calls')).trim().split('\n').map(JSON.parse); const saved = calls.find(args => args[0] === 'save'); assert.deepEqual(saved.slice(1, 3), ['--only', 'notes/Plan.md']);
  assert.match(git(ws.root, ['diff', '--cached', '--name-only']).stdout, /owner.txt/); assert.equal(git(ws.root, ['show', '--format=', '--name-only', 'HEAD']).stdout.trim(), 'notes/Plan.md');
  assert.ok(calls.some(args => args.slice(0, 3).join(' ') === 'runs add works:edits'));
});
test('C1/A1: a busy scheduled edits step cannot be bypassed by report rendering', async t => {
  const { ws, page } = await edited(t, { idle: true, disabled: ['sources', 'reflect', 'skills', 'queue'] }); writeFileSync(join(ws.root, 'fake-engine.json'), '{"busy":true}');
  const result = await runPipeline(ws); assert.equal(result.results.find(item => item.id === 'edits').status, 'deferred'); assert.equal(read(page), '- DOING Draft plan\n');
});
test('A2: worker profile and the per-step timeout reach the worker invocation', async t => {
  const ws = await workspace(t, { workerPermissions: { claude: { mode: 'plan', allowedTools: ['Read'] } } }); ws.engine.agents = { worker: { tool: 'claude' } }; let captured;
  const result = await builtIn(ws, 'reflect', { timeoutMs: 555000, execute: async (command, args, options) => { captured = { command, args, options }; return { code: 0, output: '{"is_error":false,"result":"done"}' }; } });
  assert.equal(result.code, 0); assert.equal(captured.options.timeoutMs, 555000); assert.ok(captured.args.includes('plan')); assert.equal(captured.args.at(-1), 'Read');
});
test('A3: the improvements close command advances to the next request', async t => {
  const ws = await workspace(t); mkdirSync(join(ws.root, '.excudo/works'), { recursive: true }); writeFileSync(join(ws.root, '.excudo/works/edits.json'), JSON.stringify({ version: 2, items: [], applied: [], improvements: [{ id: 'first', status: 'open' }, { id: 'second', status: 'open' }], dirtyFiles: [] }));
  const result = spawnSync(process.execPath, [resolve('bin/excudo-works.mjs'), 'improvements', 'close', 'first'], { cwd: ws.root, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr);
  const state = JSON.parse(read(join(ws.root, '.excudo/works/edits.json'))); assert.equal(state.improvements[0].status, 'closed'); assert.equal(state.improvements.find(item => item.status === 'open').id, 'second');
});
test('A4: remove restores the previous hook and a global hook directory stays unchanged', async t => {
  const ws = await workspace(t); git(ws.root, ['init']); const hook = join(ws.root, '.git/hooks/pre-push'); writeFileSync(hook, '#!/bin/sh\nexit 0\n'); pushGuard(ws.root, true); pushGuard(ws.root, 'remove'); assert.equal(read(hook), '#!/bin/sh\nexit 0\n');
  const global = join(ws.root, 'fixture-global-config'), outside = join(ws.root, 'shared'); mkdirSync(outside); writeFileSync(join(outside, 'pre-push'), 'keep'); writeFileSync(global, `[core]\n hooksPath = ${JSON.stringify(outside)}\n`);
  const previous = process.env.GIT_CONFIG_GLOBAL; process.env.GIT_CONFIG_GLOBAL = global;
  try { assert.throws(() => pushGuard(ws.root, true), /Refused/); assert.equal(read(join(outside, 'pre-push')), 'keep'); }
  finally { if (previous === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = previous; }
});
test('A5: dropped kit links are removed while edited user links survive and doctor sees broken links', async t => {
  const ws = await workspace(t); installSkillLinks(ws.root, { names: ['works-old'] }); assert.ok(existsSync(join(ws.root, '.excudo/works/install.json')));
  const changed = join(ws.root, '.claude/skills/works-old');
  const { unlinkSync } = await import('node:fs'); unlinkSync(changed); symlinkSync(join(ws.root, 'missing-owner-target'), changed, process.platform === 'win32' ? 'junction' : 'dir');
  installSkillLinks(ws.root, { names: [] }); assert.throws(() => readFileSync(join(ws.root, '.agents/skills/works-old')), /ENOENT/);
  const result = await doctor(ws.root); assert.ok(result.checks.some(item => item.id === 'broken-link:.claude/works-old'));
});
test('A7: release metadata consistency catches a version absent from the changelog', () => {
  assert.ok(release.metadataProblems?.({ name: 'excudo-works', version: '9.8.7', peerDependencies: { excudo: '^0.8.0' } }, '# Changelog\n\n## 0.1.0\n').length > 0);
});
test('A8: engine budget overrun reaches the backlog while normal work continues', async t => {
  const ws = await workspace(t); writeFileSync(join(ws.root, 'fake-engine.json'), '{"instructions":{"over":true,"bytes":200,"limit":100}}');
  const result = await runPipeline(ws, { execute: async () => ({ code: 0, output: 'done' }) }); assert.equal(result.ok, true); assert.match(read(result.backlog), /Engine instruction budget exceeded: 200\/100/);
});
test('A10: conversations off falls back to recent Git commits from engine folders', async t => {
  const ws = await workspace(t); writeFileSync(join(ws.root, 'Project.txt'), 'activity'); commit(ws.root); git(ws.root, ['config', 'user.email', 'fixture.invalid']);
  const result = await gitActivity(ws, new Date(Date.now() + 1000)); assert.ok(result.commits.some(item => item.text.includes('Set up fixture')));
  assert.ok((await doctor(ws.root)).checks.some(item => item.id === 'activity' && /conversations is off/.test(item.detail)));
});
test('A11: retention keeps only the configured count and never deletes other archive names', async t => {
  const ws = await workspace(t, { backup: { folder: 'archives', passwordEnv: 'WORKS_FIXTURE_KEY', keep: 1 } }); const previous = process.env.WORKS_FIXTURE_KEY; process.env.WORKS_FIXTURE_KEY = randomBytes(24).toString('hex');
  t.after(() => { if (previous === undefined) delete process.env.WORKS_FIXTURE_KEY; else process.env.WORKS_FIXTURE_KEY = previous; });
  const copy = { engineBackup: async () => ({ code: 0 }) }; await backup(ws, new Date('2030-01-01'), copy); await backup(ws, new Date('2030-01-02'), copy);
  assert.equal(readdirSync(join(ws.root, 'archives')).filter(name => name.endsWith('.ewb')).length, 1);
  assert.equal(backupModule.passwordSource({ secretService: 'fixture' }, 'linux').safeForSchedule, true); assert.equal(backupModule.passwordSource({ credentialName: 'fixture' }, 'win32').safeForSchedule, true);
});
test('A11: doctor warns when a scheduled backup relies on an unprovisioned environment variable', async t => {
  const ws = await workspace(t, { scheduler: { hour: 9 }, backup: { folder: 'archives', passwordEnv: 'UNSET_FIXTURE_VARIABLE' } }); const result = await doctor(ws.root); assert.equal(result.checks.find(item => item.id === 'backup-password').status, 'warning');
});
for (const name of skillNames) test(`A13: real gathered facts fail for an incomplete ${name} workspace`, async t => {
  const ws = await workspace(t); const facts = await gatherSkill(name, ws); assert.equal(evaluate(name, facts).every(item => item.ok), false);
});
test('C5/C7: CRLF reports and literal titles survive rendering, approval and judgment', async t => {
  const { ws, page, file } = await edited(t);
  writeFileSync(file, read(file).replace('Outline plan', () => 'Review $& costs').replace(/\r?\n/g, () => '\r\n'));
  await syncEdits(ws); assert.equal(read(page), '- DOING Review $& costs\n');
  await writeReport(ws, { activity }); assert.equal(/(^|[^\r])\n/.test(read(file)), false);
  writeFileSync(file, read(file).replace('DOING Review $& costs', () => 'DONE Approve $& costs')); await syncEdits(ws); await writeReport(ws, { activity });
  const line = read(file).split(/\r?\n/).find(text => text.includes('Apply this title or status edit'));
  writeFileSync(file, read(file).replace(line, () => `${line} // 적용`)); await syncEdits(ws); assert.equal(read(page), '- DONE Approve $& costs\n');
  await writeReport(ws, { activity }); writeFileSync(file, read(file) + '\r\n- Question // Rename it again\r\n'); const pending = await syncEdits(ws), comment = pending.items.find(item => item.kind === 'comment' && item.status === 'open');
  const snapshot = JSON.parse(read(join(ws.root, '.excudo/works/report.json')));
  await judgeComments(ws, { judge: async () => ({ code: 0, output: JSON.stringify([{ id: comment.id, action: 'task-edit', task: snapshot.tasks[0].id, title: 'Literal $& title', status: 'DOING' }]) }) });
  assert.equal(read(page), '- DOING Literal $& title\n');
});
test('C2: an approval cannot follow a task to a different source line', async t => {
  const { ws, page, file } = await edited(t); writeFileSync(file, read(file).replace('DOING Outline plan', 'DONE Outline plan')); await syncEdits(ws); await writeReport(ws, { activity });
  writeFileSync(page, '# New owner introduction\n- DOING Draft plan\n'); await writeReport(ws, { activity });
  const line = read(file).split('\n').find(text => text.includes('Apply this title or status edit')); writeFileSync(file, read(file).replace(line, () => `${line} // apply`)); await syncEdits(ws);
  assert.equal(read(page), '# New owner introduction\n- DOING Draft plan\n');
});
test('A13: backup gather rejects a restore receipt inside the live workspace', async t => {
  const ws = await workspace(t, { backup: { passwordEnv: 'UNSET_KEY' } }); mkdirSync(join(ws.root, '.excudo/works'), { recursive: true });
  writeFileSync(join(ws.root, '.excudo/works/backup.json'), JSON.stringify({ version: 1, lastRestore: { folder: join(ws.root, 'overwritten') } }));
  assert.equal((await gatherSkill('works-backup', ws)).separateRestore, false);
});
test('A1: memo application runs inside the exported engine graph lock', async t => {
  const ws = await workspace(t), { underGraph } = await import('../src/engine.mjs');
  await underGraph(ws, () => { assert.ok(existsSync(join(ws.cacheDir, 'graph.lock'))); return { files: [] }; });
  assert.equal(existsSync(join(ws.cacheDir, 'graph.lock')), false);
});
test('A3/A6: a classified improvement can be answered and closed from its report line', async t => {
  const { ws, file } = await edited(t); await syncEdits(ws); await writeReport(ws, { activity });
  writeFileSync(file, read(file) + '\n- Note // Improve the report wording\n'); let state = await syncEdits(ws); const comment = state.items.find(item => item.kind === 'comment' && item.status === 'open');
  await judgeComments(ws, { judge: async () => ({ code: 0, output: JSON.stringify([{ id: comment.id, action: 'improvement', text: 'Improve wording' }]) }) }); await writeReport(ws, { activity });
  const line = read(file).split('\n').find(text => text.includes('Improvement:'));
  writeFileSync(file, read(file).replace(line, () => `${line} // 완료`)); state = await syncEdits(ws);
  assert.equal(state.improvements.find(item => item.id === comment.id).status, 'closed');
});
test('A3: a substantive answer settles its original improvement after judgment', async t => {
  const { ws, file } = await edited(t); await syncEdits(ws); writeFileSync(file, read(file) + '\n- Note // improve: Better labels\n'); let state = await syncEdits(ws); const request = state.improvements[0]; await writeReport(ws, { activity });
  const line = read(file).split('\n').find(text => text.includes('Improvement:')); writeFileSync(file, read(file).replace(line, () => `${line} // Already fixed in the configuration`)); state = await syncEdits(ws);
  assert.equal(state.improvements[0].status, 'answered'); const answer = state.items.find(item => item.kind === 'comment' && item.status === 'open');
  await judgeComments(ws, { judge: async () => ({ code: 0, output: JSON.stringify([{ id: answer.id, action: 'resolve', reason: 'Owner confirmed the fix' }]) }) });
  state = JSON.parse(read(join(ws.root, '.excudo/works/edits.json'))); assert.equal(state.improvements.find(item => item.id === request.id).status, 'closed');
});
test('A3: processed requests do not suppress a later repeat after report refresh', async t => {
  const { ws, page, file } = await edited(t); await syncEdits(ws); await writeReport(ws, { activity });
  writeFileSync(file, read(file).replace('Outline plan', 'Draft plan')); await syncEdits(ws); await writeReport(ws, { activity });
  writeFileSync(file, read(file).replace('Draft plan', 'Outline plan')); await syncEdits(ws);
  assert.equal(read(page), '- DOING Outline plan\n');
});
test('C5: report rendering preserves mixed owner line endings outside its block', async t => {
  const { ws, file } = await edited(t); await syncEdits(ws);
  const generated = read(file).replace(/\r?\n/g, () => '\r\n'); writeFileSync(file, `Owner introduction\n${generated}Owner footer\n`);
  await writeReport(ws, { activity }); assert.ok(read(file).startsWith('Owner introduction\n')); assert.ok(read(file).endsWith('Owner footer\n'));
});
test('C1/A1: individual scheduled edit skills honor the busy gate', async t => {
  const { ws, page } = await edited(t, { idle: true }); writeFileSync(join(ws.root, 'fake-engine.json'), '{"busy":true}');
  const result = spawnSync(process.execPath, [resolve('skills/works-sync-edits/scripts/run.mjs'), '--scheduled'], { cwd: ws.root, encoding: 'utf8' });
  assert.notEqual(result.status, 0); assert.equal(read(page), '- DOING Draft plan\n');
});
test('C1/A1: custom scheduled scripts inherit the memo-write idle context', async t => {
  const { ws, page } = await edited(t, { idle: true, disabled: ['sources', 'edits', 'reflect', 'skills', 'queue', 'report'], steps: [{ id: 'custom', script: 'custom.mjs' }] });
  const { pathToFileURL } = await import('node:url');
  writeFileSync(join(ws.root, 'custom.mjs'), `import {syncEdits} from ${JSON.stringify(pathToFileURL(resolve('src/edits.mjs')).href)}; import {loadConfig} from ${JSON.stringify(pathToFileURL(resolve('src/config.mjs')).href)}; await syncEdits(await loadConfig());`);
  writeFileSync(join(ws.root, 'fake-engine.json'), '{"busyAfterIdle":1}'); const result = await runPipeline(ws);
  assert.equal(result.results[0].status, 'success', JSON.stringify(result));
  assert.equal(read(page), '- DOING Draft plan\n');
});
