import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { workspace } from './helpers.mjs';
import { crossReview } from '../src/agents.mjs';
const git = (root, args, input) => { const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', input }); assert.equal(r.status, 0, r.stderr); };
test('F1: many small commits keep the whole review prompt under the cap and report what was omitted', async t => {
  const ws = await workspace(t, { review: { days: 7, maxDiffBytes: 3000 } }); ws.engine.agents = { reviewers: [{ tool: 'codex' }] };
  git(ws.root, ['init']); writeFileSync(join(ws.root, '.gitignore'), '.excudo/\n.fake-engine-calls\nfake-engine.json\n');
  git(ws.root, ['add', '.']); git(ws.root, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture.invalid', 'commit', '-m', 'Start']);
  assert.equal((await crossReview(ws, { execute: async () => ({ code: 0, output: 'NO_MEANINGFUL_FEEDBACK' }) })).code, 0);
  for (let i = 0; i < 120; i++) { writeFileSync(join(ws.root, `note-${i}.txt`), `change ${i}\n`); git(ws.root, ['add', '.']); git(ws.root, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture.invalid', 'commit', '-q', '-m', `Change number ${i}`]); }
  writeFileSync(join(ws.root, 'weekly-touch'), ''); // untracked noise does not matter
  const state = join(ws.root, '.excudo/works/review.json'), saved = JSON.parse(readFileSync(state)); saved.at = '2000-01-01T00:00:00Z'; writeFileSync(state, JSON.stringify(saved));
  let input; const result = await crossReview(ws, { execute: async (command, args, options) => { input = options.input; return { code: 0, output: 'NO_MEANINGFUL_FEEDBACK' }; } });
  assert.equal(result.code, 0, result.output);
  assert.ok(input.length < 3000 + 3000, `prompt ${input.length}`); assert.match(input, /omitted/i); assert.match(input, /Change number 119/);
  assert.match(readFileSync(join(ws.root, '.excudo/reports/works-review.md'), 'utf8'), /omitted/i);
});
