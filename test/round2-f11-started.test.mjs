import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace } from './helpers.mjs';
import { runPipeline } from '../src/pipeline.mjs';
test('F11: engine run records receive the step start time, not its end time', async t => {
  const ws = await workspace(t, { disabled: ['sources', 'edits', 'reflect', 'skills', 'queue'] });
  const result = await runPipeline(ws, { manual: true, execute: async () => { await new Promise(done => setTimeout(done, 120)); return { code: 0, output: 'done' }; } });
  const call = readFileSync(join(ws.root, '.fake-engine-calls'), 'utf8').trim().split('\n').map(JSON.parse).find(args => args.slice(0, 3).join(' ') === 'runs add works:report');
  const since = Date.parse(call[call.indexOf('--since') + 1]), ended = Date.parse(result.results[0].at);
  assert.ok(ended - since >= 100, `duration ${ended - since}ms`);
});
