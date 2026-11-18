import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, symlinkSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { workspace } from './helpers.mjs';
import { initWorkspace, refreshOwned, replaceOwned, PACKAGE_ROOT } from '../src/init.mjs';
import { checkPrinciples, checkHome } from '../src/principles.mjs';
import { doctor, supportedEngine } from '../src/doctor.mjs';
import { loadConfig } from '../src/config.mjs';
import { update } from '../src/update.mjs';
import { feedback } from '../src/feedback.mjs';
import { scheduleInfo } from '../src/scheduler.mjs';
test('initialization preserves user files, principles and edited instruction blocks', async t => {
  const ws = await workspace(t); writeFileSync(join(ws.root, 'policy.json'), '{"version":1,"applyTaskEdits":false}');
  await initWorkspace(ws.root);
  assert.match(readFileSync(join(ws.root, 'AGENTS.md'), 'utf8'), /^# Owner rules/);
  assert.equal(JSON.parse(readFileSync(join(ws.root, 'policy.json'))).applyTaskEdits, false);
  ws.config.principles = true; assert.equal(checkPrinciples(ws).ok, true);
  const agents = join(ws.root, 'AGENTS.md'); writeFileSync(agents, readFileSync(agents, 'utf8').replace('Daily routine', 'My custom routine'));
  assert.equal(refreshOwned(ws.root).find(x => x.file === 'AGENTS.md').status, 'preserved');
  const before = readFileSync(agents, 'utf8').split('<!-- works:principles:start -->')[1];
  refreshOwned(ws.root, { force: true }); assert.match(readFileSync(agents, 'utf8'), /Daily routine/);
  assert.equal(readFileSync(agents, 'utf8').split('<!-- works:principles:start -->')[1], before);
  assert.throws(() => replaceOwned('<!-- excudo-works:start -->broken', 'replacement'), /ambiguous/);
});
test('doctor handles the local engine mismatch as a warning and checks actual links', async t => {
  const ws = await workspace(t); await initWorkspace(ws.root);
  mkdirSync(join(ws.root, 'node_modules'), { recursive: true });
  symlinkSync(resolve('node_modules/excudo'), join(ws.root, 'node_modules/excudo'), 'junction');
  symlinkSync(PACKAGE_ROOT, join(ws.root, 'node_modules/excudo-works'), 'junction');
  const result = await doctor(ws.root); assert.equal(result.ok, true);
  assert.ok(result.checks.filter(x => x.id.startsWith('skill:')).every(x => x.status === 'ok'));
  assert.equal(supportedEngine('0.7.0'), true); assert.equal(supportedEngine('0.6.0'), false); assert.equal(supportedEngine('0.8.0'), false);
});
test('offline update is successful and migrates without changing user config', async t => {
  const ws = await workspace(t); await initWorkspace(ws.root); const before = readFileSync(join(ws.root, 'excudo.config.mjs'), 'utf8');
  const result = await update(ws, { registry: { code: 1, output: 'offline' }, apply: true });
  assert.equal(result.ok, true); assert.equal(result.offline, true); assert.equal(result.records, 2); assert.deepEqual(result.commands, []);
  assert.equal(readFileSync(join(ws.root, 'excudo.config.mjs'), 'utf8'), before);
  const online = await update(ws, { registry: { code: 0, output: '"0.2.0"' } }); assert.match(online.commands[0], /--save-exact excudo-works@0.2.0/);
});
test('feedback creates a local draft and URL without putting diagnostics in the URL', async t => {
  const ws = await workspace(t); const result = await feedback(ws.root, { engine: { code: 1, output: 'not supported' } });
  assert.match(result.draft, /Engine feedback is unavailable/); assert.equal(result.url.includes(encodeURIComponent(ws.root)), false); assert.match(result.url, /issues\/new\?/);
});
test('scheduler renders all three platforms without registering anything', async t => {
  const ws = await workspace(t, { scheduler: { hour: 10, minute: 25 } });
  assert.match(scheduleInfo(ws, 'linux').content, /^25 10 \* \* \*/); assert.match(scheduleInfo(ws, 'darwin').content, /StartCalendarInterval/); assert.match(scheduleInfo(ws, 'win32').command, /schtasks \/Create/);
});
test('Home checks only report layout and preserve work area comparisons', () => {
  const before = '# Home\n## Personal plans\nPlan\n## Work\n```query\nDOING\n```\n';
  assert.equal(checkHome(before).ok, true); assert.equal(checkHome(before.replace('Plan\n', 'New plan\n'), { before }).ok, true);
  assert.equal(checkHome(before.replace('DOING', 'DONE'), { before }).ok, false); assert.equal(checkHome('## Work\n## Personal plans').ok, false);
});
test('invalid settings fail with actionable errors', async t => {
  const ws = await workspace(t);
  writeFileSync(join(ws.root, 'works.config.mjs'), `export default { steps: [{ id: 'bad', command: ['node'], timeoutMs: 0 }] };`);
  await assert.rejects(loadConfig(ws.root), /timeout/);
});
