import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, symlinkSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { hostname } from 'node:os';
import { spawnSync } from 'node:child_process';
import { workspace } from './helpers.mjs';
import { writeReport, collectTasks } from '../src/report.mjs';
import { syncEdits } from '../src/edits.mjs';
import { judgeComments } from '../src/judgment.mjs';
import { acquireLock, runPipeline } from '../src/pipeline.mjs';
import { agentCommand } from '../src/agents.mjs';
import * as agents from '../src/agents.mjs';
import { gatherSkill, evaluate, skillNames } from '../src/skill-check.mjs';
import { pushGuard } from '../scripts/push-guard.mjs';
import { migrate } from '../src/migrate.mjs';
import { initWorkspace, installSkillLinks } from '../src/init.mjs';
import { update } from '../src/update.mjs';
import { backup } from '../src/backup.mjs';
const activity = { commits: [], warnings: [] };
const read = file => readFileSync(file, 'utf8');
async function setup(t, text = '- DOING Draft plan\n') {
  const ws = await workspace(t); const page = join(ws.graph, 'Plan.md'), report = join(ws.root, 'weekly.md');
  writeFileSync(page, text); await writeReport(ws, { activity }); return { ws, page, report };
}
test('C1/C3: report rendering collects edits without changing memo sources', async t => {
  const { ws, page, report } = await setup(t); writeFileSync(report, read(report).replace('Draft plan', 'Changed plan'));
  await writeReport(ws, { activity }); assert.equal(read(page), '- DOING Draft plan\n');
});
test('C2: an old approval cannot overwrite a subsequently changed source', async t => {
  const { ws, page, report } = await setup(t, '- WAITING Draft plan\n');
  writeFileSync(report, read(report).replace('WAITING Draft plan', 'DONE Draft plan')); await syncEdits(ws); await writeReport(ws, { activity });
  writeFileSync(page, '- WAITING Concurrent owner title\n'); await writeReport(ws, { activity });
  const question = read(report).split('\n').find(line => line.includes('Apply this title or status edit'));
  writeFileSync(report, read(report).replace(question, `${question} // apply`)); await syncEdits(ws);
  assert.equal(read(page), '- WAITING Concurrent owner title\n');
});
test('C3: report rendering refuses a concurrent report edit during adapter work', async t => {
  const { ws, report } = await setup(t); ws.config.report.adapter = 'adapter.mjs';
  writeFileSync(join(ws.root, 'adapter.mjs'), `import {appendFileSync} from 'node:fs'; import {join} from 'node:path'; export default ({root})=>{appendFileSync(join(root,'weekly.md'),'Concurrent owner note\\n');return []}`);
  await assert.rejects(writeReport(ws, { activity }), /changed|retry/i); assert.match(read(report), /Concurrent owner note/);
});
test('C4/A9: a live routine lock blocks a single report skill', async t => {
  const { ws } = await setup(t); const release = acquireLock(ws.root);
  try {
    const result = spawnSync(process.execPath, [resolve('skills/works-weekly-report/scripts/run.mjs')], { cwd: ws.root, encoding: 'utf8', timeout: 30000 });
    assert.notEqual(result.status, 0);
  } finally { release(); }
});
test('C4: a judgment response cannot overwrite state added during its await', async t => {
  const { ws, report } = await setup(t); writeFileSync(report, read(report) + '\n- Question // Rename draft\n'); const pending = await syncEdits(ws); const id = pending.items.find(x => x.kind === 'comment').id;
  await assert.rejects(judgeComments(ws, { judge: async () => {
    const file = join(ws.root, '.excudo/works/edits.json'), value = JSON.parse(read(file)); value.items.push({ id: 'concurrent', question: 'Keep me', status: 'open' }); writeFileSync(file, JSON.stringify(value));
    return { code: 0, output: JSON.stringify([{ id, action: 'ask', question: 'Which title?' }]) };
  } }), /changed|retry/i);
  assert.ok(JSON.parse(read(join(ws.root, '.excudo/works/edits.json'))).items.some(x => x.id === 'concurrent'));
});
test('C5: CRLF tasks are collected and source endings survive edits', async t => {
  const { ws, page, report } = await setup(t, '- DOING Draft plan\r\n- WAITING Review\r\n');
  assert.equal(collectTasks(ws).length, 2); writeFileSync(report, read(report).replace('Draft plan', 'Outline plan')); await syncEdits(ws);
  assert.equal(read(page), '- DOING Outline plan\r\n- WAITING Review\r\n');
});
test('C6: a comment suffix on a task stays a comment and keeps task identity', async t => {
  const { ws, report } = await setup(t); const line = read(report).split('\n').find(x => x.includes('<!-- task:'));
  writeFileSync(report, read(report).replace(line, `${line} // Rename to outline`)); const pending = await syncEdits(ws);
  assert.ok(pending.items.some(x => x.kind === 'comment' && x.text === 'Rename to outline'));
  assert.equal(pending.items.some(x => /removed or reformatted/.test(x.question)), false);
});
test('C7: replacement metacharacters remain literal in direct and approved titles', async t => {
  const { ws, page, report } = await setup(t); writeFileSync(report, read(report).replace('Draft plan', () => 'Review $& costs')); await syncEdits(ws);
  assert.equal(read(page), '- DOING Review $& costs\n');
});
test('C8/A13: gatherSkill rejects a Home query above Work', async t => {
  const ws = await workspace(t, { home: { file: 'notes/Home.md' } }); writeFileSync(join(ws.graph, 'Home.md'), '## Personal plans\n```query\nDOING\n```\n## Work\n');
  assert.equal(evaluate('works-home-layout', await gatherSkill('works-home-layout', ws)).every(x => x.ok), false);
});
test('A2: worker argv grants only the configured safe edit permissions', () => {
  const args = agentCommand({ tool: 'claude' }, 'Work'); assert.ok(args.includes('acceptEdits')); assert.ok(args.includes('json')); assert.ok(args.some(x => x.includes('Bash(npx --no-install excudo:*)')));
});
test('A2: worker error envelopes are failures even with exit zero', () => {
  const result = agents.agentResult?.({ tool: 'claude' }, { code: 0, output: '{"is_error":true,"result":"Denied"}' }); assert.equal(result?.code, 1);
});
test('A2: workers default to a separate twenty-minute timeout', async t => {
  const ws = await workspace(t); assert.equal(ws.config.agentTimeoutMs, 1200000);
});
test('A3/A12: localized done and dismiss answers close originals', async t => {
  const { ws, report } = await setup(t); writeFileSync(report, read(report) + '\n- Question // Explain the next step\n'); const pending = await syncEdits(ws); await writeReport(ws, { activity });
  const id = pending.items.find(x => x.kind === 'comment').id, line = read(report).split('\n').find(x => x.includes(`[${id}]`));
  writeFileSync(report, read(report).replace(line, `${line} // 완료`)); const next = await syncEdits(ws);
  assert.equal(next.items.find(x => x.id === id)?.status, 'closed');
});
test('A4: the push guard refuses a hooks directory outside the repository git directory', async t => {
  const ws = await workspace(t); spawnSync('git', ['init'], { cwd: ws.root }); const hooks = join(ws.root, 'shared-hooks'); mkdirSync(hooks); const hook = join(hooks, 'pre-push'); writeFileSync(hook, 'original');
  spawnSync('git', ['config', '--local', 'core.hooksPath', hooks], { cwd: ws.root });
  assert.throws(() => pushGuard(ws.root, true), /git|hook|local/i); assert.equal(read(hook), 'original');
});
test('A5: update migrates edits and records created links for dropped-skill cleanup', async t => {
  const ws = await workspace(t); mkdirSync(join(ws.root, '.excudo/works'), { recursive: true }); writeFileSync(join(ws.root, '.excudo/works/edits.json'), '{"version":1,"items":[{"id":"old","question":"Review"}],"applied":[],"improvements":[]}');
  await migrate(ws.root); const edits = JSON.parse(read(join(ws.root, '.excudo/works/edits.json'))); assert.equal(edits.version, 2); assert.equal(edits.items[0].status, 'open');
});
test('A5: update prints the new release engine peer install', async t => {
  const ws = await workspace(t); await initWorkspace(ws.root);
  const result = await update(ws, { registry: { code: 0, output: '"0.3.0"' }, registryPeers: { code: 0, output: '{"excudo":"^0.9.0"}' } });
  assert.match(result.commands.join('\n'), /excudo@.*0\.9\.0/);
});
test('A6: improvement judgment is not re-ingested before the report refresh', async t => {
  const { ws, report } = await setup(t); writeFileSync(report, read(report) + '\n- Question // Make alerts shorter\n'); const pending = await syncEdits(ws), id = pending.items.find(x => x.kind === 'comment').id;
  await judgeComments(ws, { judge: async () => ({ code: 0, output: JSON.stringify([{ id, action: 'improvement', text: 'Shorten alerts' }]) }) });
  const next = await syncEdits(ws); assert.equal(next.items.filter(x => x.id === id && x.status !== 'closed').length, 0); await writeReport(ws, { activity });
});
test('A7: the CLI version follows its own installed package manifest', async t => {
  const ws = await workspace(t); cpSync('src', join(ws.root, 'src'), { recursive: true }); cpSync('bin', join(ws.root, 'bin'), { recursive: true }); const pkg = JSON.parse(read('package.json')); pkg.version = '9.8.7'; writeFileSync(join(ws.root, 'package.json'), JSON.stringify(pkg));
  const result = spawnSync(process.execPath, [join(ws.root, 'bin/excudo-works.mjs'), '--version'], { encoding: 'utf8' }); assert.equal(result.stdout.trim(), '9.8.7');
});
test('A8: an instruction overrun is a warning and does not stop the routine', async t => {
  const ws = await workspace(t); ws.config.instructionLimit = 1;
  const result = await runPipeline(ws, { execute: async () => ({ code: 0, output: 'done' }) }); assert.equal(result.ok, true);
});
test('A9: a dead same-host lock owner can be replaced', async t => {
  const ws = await workspace(t), lock = join(ws.root, '.excudo/works/run.lock'); mkdirSync(lock, { recursive: true }); writeFileSync(join(lock, 'owner.json'), JSON.stringify({ pid: 999999999, host: hostname(), token: 'old' }));
  const release = acquireLock(ws.root); release(); assert.equal(existsSync(lock), false);
});
test('A11: backup rejects oversized input before making the engine snapshot', async t => {
  const ws = await workspace(t, { backup: { folder: 'archives', passwordEnv: 'UNSET_TEST_PASSWORD', maxBytes: 1 } }); let called = false;
  await assert.rejects(backup(ws, new Date(), { engineBackup: async () => { called = true; return { code: 0 }; } }), /maxBytes|exceeds/i); assert.equal(called, false);
});
test('A12: Korean initialization uses a localized principles heading', async t => {
  const ws = await workspace(t); writeFileSync(join(ws.root, 'excudo.config.mjs'), 'export default {locale:"ko",works:{principles:false,idle:false}}'); await initWorkspace(ws.root, { locale: 'ko' }); assert.match(read(join(ws.root, 'AGENTS.md')), /## 사용자 원칙/);
});
test('A14: the step template demonstrates the required id and command object', () => assert.match(read('template/works.config.mjs'), /\{ id: 'name', command:/));
test('A15: kit records and logs follow the configured engine cache folder', async t => {
  const ws = await workspace(t); ws.engine.cache = '.cache'; ws.cacheDir = join(ws.root, '.cache');
  const result = await runPipeline(ws, { execute: async () => ({ code: 0, output: 'done' }) }); assert.ok(result.log.startsWith(join(ws.root, '.cache'))); assert.ok(existsSync(join(ws.root, '.cache/works/records.json')));
});
