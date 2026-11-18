import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { workspace } from './helpers.mjs';
import { crossReview, agentCommand } from '../src/agents.mjs';
async function repository(t) {
  const ws = await workspace(t, { review: { days: 7 } });
  ws.engine.agents = { reviewers: [{ tool: 'claude' }, { tool: 'codex' }] };
  spawnSync('git', ['init'], { cwd: ws.root });
  writeFileSync(join(ws.root, '.gitignore'), '.excudo/\n');
  spawnSync('git', ['add', 'AGENTS.md', '.gitignore'], { cwd: ws.root });
  const git = spawnSync('git', ['-c', 'user.name=Fixture Owner', '-c', 'user.email=fixture.invalid', 'commit', '-m', 'Add initial rules'], { cwd: ws.root });
  assert.equal(git.status, 0); return ws;
}
test('review handles the initial commit and advances only after valid read-only results', async t => {
  const ws = await repository(t), prompts = [];
  const result = await crossReview(ws, { execute: async (command, args, options) => { prompts.push({ command, args, input: options.input }); return { code: 0, output: command === 'claude' ? JSON.stringify({ result: 'NO_MEANINGFUL_FEEDBACK', is_error: false }) : 'NO_MEANINGFUL_FEEDBACK' }; } });
  assert.equal(result.code, 0); assert.equal(prompts.length, 2); assert.match(prompts[0].input, /Add initial rules/);
  const record = JSON.parse(readFileSync(join(ws.root, '.excudo/works/review.json'))); assert.equal(record.readOnly, true);
  assert.equal((await crossReview(ws, { execute: () => { throw new Error('not due'); } })).code, 0);
});
test('invalid reviewer output and concurrent changes keep the review marker unchanged', async t => {
  const ws = await repository(t);
  assert.equal((await crossReview(ws, { execute: async () => ({ code: 0, output: 'Login required.' }) })).code, 1);
  assert.equal(existsSync(join(ws.root, '.excudo/works/review.json')), false);
  const changed = await crossReview(ws, { execute: async command => { writeFileSync(join(ws.root, 'AGENTS.md'), 'Concurrent owner edit'); return { code: 0, output: command === 'claude' ? JSON.stringify({ result: 'NO_MEANINGFUL_FEEDBACK', is_error: false }) : 'NO_MEANINGFUL_FEEDBACK' }; } });
  assert.equal(changed.code, 1); assert.equal(existsSync(join(ws.root, '.excudo/works/review.json')), false); assert.equal(readFileSync(join(ws.root, 'AGENTS.md'), 'utf8'), 'Concurrent owner edit');
});
test('reviewer CLI arguments explicitly request read-only execution', () => {
  assert.ok(agentCommand({ tool: 'codex' }, 'Review', { review: true }).includes('read-only'));
  const claude = agentCommand({ tool: 'claude' }, 'Review', { review: true }); assert.ok(claude.includes('plan')); assert.ok(claude.includes('Read,Glob,Grep'));
});
