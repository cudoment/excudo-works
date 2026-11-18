import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace } from './helpers.mjs';
import { acquireLock, runPipeline, stepsOf } from '../src/pipeline.mjs';
import { runCommand } from '../src/process.mjs';
const pass = async () => ({ code: 0, output: 'done' });
const now = new Date('2030-01-02T09:00:00Z');
test('ordered steps, daily success skip, and retry only failed steps', async t => {
  const ws = await workspace(t), called = [];
  const first = await runPipeline(ws, { now, execute: async step => { called.push(step.id); return { code: step.id === 'reflect' ? 1 : 0, output: 'result' }; } });
  assert.equal(first.ok, false); assert.deepEqual(called, stepsOf(ws).map(x => x.id));
  called.length = 0;
  const second = await runPipeline(ws, { now, execute: async step => { called.push(step.id); return pass(); } });
  assert.equal(second.ok, true); assert.deepEqual(called, ['edits', 'reflect', 'queue', 'report']);
  assert.ok(existsSync(second.backlog)); assert.equal(existsSync(join(ws.root, '.excudo/works/run.lock')), false);
});
test('only a completely successful full manual run suppresses exactly one scheduled run', async t => {
  const ws = await workspace(t);
  await runPipeline(ws, { manual: true, only: 'report', now, execute: pass });
  let record = JSON.parse(readFileSync(join(ws.root, '.excudo/works/records.json'))); assert.equal(record.manual, null);
  await runPipeline(ws, { manual: true, now, execute: async () => ({ code: 75, output: 'deferred' }) });
  record = JSON.parse(readFileSync(join(ws.root, '.excudo/works/records.json'))); assert.equal(record.manual, null);
  await runPipeline(ws, { manual: true, now, execute: pass });
  const next = await runPipeline(ws, { now: new Date(now.getTime() + 60000), execute: () => { throw new Error('must skip'); } });
  assert.equal(next.skipped, 'manual-window');
  const later = await runPipeline(ws, { now: new Date(now.getTime() + 120000), execute: pass }); assert.equal(later.skipped, undefined);
});
test('expired and future manual windows do not suppress work', async t => {
  const ws = await workspace(t);
  await runPipeline(ws, { manual: true, now, execute: pass });
  assert.equal((await runPipeline(ws, { now: new Date(now.getTime() + 61 * 60000), execute: pass })).skipped, undefined);
  assert.equal((await runPipeline(ws, { now: new Date(now.getTime() - 60000), execute: pass })).skipped, undefined);
});
test('lock refuses overlap and never steals a stale or unknown lock', async t => {
  const ws = await workspace(t), unlock = acquireLock(ws.root);
  assert.throws(() => acquireLock(ws.root), /run lock exists/);
  await assert.rejects(runPipeline(ws, { execute: pass }), /run lock exists/);
  unlock(); const release = acquireLock(ws.root); release();
});
test('configured custom command timeout records failure and keeps no manual marker', async t => {
  const ws = await workspace(t, { steps: [{ id: 'slow', command: [process.execPath, '-e', 'setInterval(()=>{},1000)'], timeoutMs: 80 }] });
  const result = await runPipeline(ws, { manual: true, only: 'slow' });
  assert.equal(result.ok, false); assert.equal(result.results[0].status, 'timeout');
  assert.match(readFileSync(result.backlog, 'utf8'), /slow: timeout/);
});
test('spawn failure and abort return explicit failures', async () => {
  assert.equal((await runCommand('missing-works-test-executable-zz', [], { timeoutMs: 500 })).code, 127);
  const controller = new AbortController(); controller.abort();
  assert.equal((await runCommand(process.execPath, ['-e', '0'], { signal: controller.signal })).code, 130);
});
test('principle mismatch stops all steps and still writes a backlog', async t => {
  const ws = await workspace(t); ws.config.principles = true;
  writeFileSync(join(ws.root, 'AGENTS.md'), '<!-- works:principles:start -->\nKeep edits.\n<!-- works:principles:end -->');
  writeFileSync(join(ws.root, 'invariants.json'), '{"version":1,"text":"Changed without approval."}');
  await assert.rejects(runPipeline(ws, { execute: pass }), /must match/);
  assert.ok(existsSync(join(ws.root, '.excudo/reports/works-backlog.md')));
});
test('built-in work is also subject to the per-step timeout', async t => {
  const ws = await workspace(t, { steps: [{ id: 'report', timeoutMs: 1 }] });
  const result = await runPipeline(ws, { manual: true, only: 'report' });
  assert.equal(result.ok, false); assert.equal(result.results[0].status, 'timeout');
});
test('a later failed manual run invalidates an earlier suppression marker', async t => {
  const ws = await workspace(t);
  await runPipeline(ws, { manual: true, now, execute: pass });
  await runPipeline(ws, { manual: true, now, execute: async () => ({ code: 1, output: 'failed' }) });
  assert.equal((await runPipeline(ws, { now, execute: pass })).skipped, undefined);
});
