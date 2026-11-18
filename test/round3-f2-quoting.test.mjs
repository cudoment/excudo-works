import test from 'node:test';
import assert from 'node:assert/strict';
import { workspace } from './helpers.mjs';
import { workerPlan } from '../src/agents.mjs';
test('F2: the improvement command is quoted for the target shell and its argv is kept', async t => {
  const ws = await workspace(t); ws.engine.agents = { worker: { tool: 'claude' } };
  const posix = workerPlan(ws, "Fix the owner's note", 'linux'), windows = workerPlan(ws, "Fix the owner's note", 'win32');
  assert.equal(posix.shell, 'posix'); assert.ok(posix.command.includes(`'Fix the owner'\\''s note'`));
  assert.equal(windows.shell, 'powershell'); assert.ok(windows.command.includes(`'Fix the owner''s note'`)); assert.equal(windows.command.includes("'\\''"), false);
  assert.equal(windows.argv[1], "Fix the owner's note"); assert.deepEqual(windows.argv, posix.argv);
});
