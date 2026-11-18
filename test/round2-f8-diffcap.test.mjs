import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { workspace } from './helpers.mjs';
import { crossReview } from '../src/agents.mjs';
const git = (root, args) => { const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
test('F8: a large diff is reviewed as a stat plus a capped patch and the cut is reported', async t => {
  const ws = await workspace(t, { review: { days: 7, maxDiffBytes: 4000 } }); ws.engine.agents = { reviewers: [{ tool: 'codex' }] };
  git(ws.root, ['init']); writeFileSync(join(ws.root, '.gitignore'), '.excudo/\n.fake-engine-calls\nfake-engine.json\n');
  writeFileSync(join(ws.root, 'big.txt'), Array.from({ length: 4000 }, (_, i) => `line ${i} of generated output`).join('\n') + '\n');
  git(ws.root, ['add', '.']); git(ws.root, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture.invalid', 'commit', '-m', 'Add generated output']);
  let input; const result = await crossReview(ws, { execute: async (command, args, options) => { input = options.input; return { code: 0, output: 'NO_MEANINGFUL_FEEDBACK' }; } });
  assert.equal(result.code, 0, result.output);
  assert.ok(input.length < 4000 + 3000, `prompt ${input.length}`); assert.match(input, /big\.txt\s+\|/); assert.match(input, /omitted/i); assert.ok(input.includes('line 0 of generated output'));
  assert.equal(input.includes('line 3999 of generated output'), false);
  assert.match(readFileSync(join(ws.root, '.excudo/reports/works-review.md'), 'utf8'), /omitted/i);
});
