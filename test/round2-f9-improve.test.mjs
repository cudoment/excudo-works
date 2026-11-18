import test from 'node:test';
import assert from 'node:assert/strict';
import { workspace } from './helpers.mjs';
import { workerPlan, agentCommand } from '../src/agents.mjs';
import { loadConfig } from '../src/config.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
test('F9: the improvement command is interactive with a profile that allows branching and checks', async t => {
  const ws = await workspace(t); ws.engine.agents = { worker: { tool: 'claude', model: 'sonnet' } };
  const plan = workerPlan(ws, 'Implement on an isolated branch'), words = plan.command.split(' ');
  assert.equal(words.includes("'-p'"), false); assert.equal(plan.command.includes('--output-format'), false);
  assert.match(plan.command, /Bash\(git switch:\*\)/); assert.match(plan.command, /Bash\(npm test:\*\)/); assert.match(plan.command, /Bash\(git commit:\*\)/); assert.match(plan.command, /acceptEdits/);
  assert.equal(plan.command.includes('git push'), false);
});
test('F9: a codex improvement command is interactive and the profile is configurable apart from the memo worker', async t => {
  const ws = await workspace(t, { improvePermissions: { claude: { allowedTools: ['Read', 'Bash(make check:*)'] }, codex: { sandbox: 'workspace-write' } } });
  const command = agentCommand({ tool: 'codex' }, 'Do it', { interactive: true, permissions: ws.config.improvePermissions });
  assert.equal(command.includes('exec'), false); assert.ok(command.includes('workspace-write')); assert.equal(command.at(-1), 'Do it');
  const claude = agentCommand({ tool: 'claude' }, 'Do it', { interactive: true, permissions: ws.config.improvePermissions }); assert.ok(claude.includes('Read,Bash(make check:*)')); assert.equal(claude[1], 'Do it');
  assert.deepEqual(ws.config.workerPermissions.claude.allowedTools.includes('Bash(git switch:*)'), false);
});
test('F9: an invalid improvement profile is rejected', async t => {
  const ws = await workspace(t); writeFileSync(join(ws.root, 'works.config.mjs'), `export default { improvePermissions: { claude: { mode: 'bypassPermissions' } } };`);
  await assert.rejects(loadConfig(ws.root), /improvement permission/i);
});
