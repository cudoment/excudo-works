import test from 'node:test';
import assert from 'node:assert/strict';
import { workspace } from './helpers.mjs';
import { stepsOf } from '../src/pipeline.mjs';
test('F6: a built-in step override keeps unspecified defaults such as daily false', async t => {
  const ws = await workspace(t, { steps: [{ id: 'report', timeoutMs: 300000 }, { id: 'sources', daily: false }] });
  const steps = stepsOf(ws), report = steps.find(step => step.id === 'report'), sources = steps.find(step => step.id === 'sources');
  assert.equal(report.daily, false); assert.equal(report.timeoutMs, 300000);
  assert.equal(sources.daily, false);
  assert.equal(steps.find(step => step.id === 'edits').daily, false);
  assert.equal(steps.find(step => step.id === 'reflect').daily, true);
});
