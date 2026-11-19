import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, stepProblems } from '../scripts/install-test.mjs';

test('install test arguments accept one engine source', () => {
  assert.deepEqual(parseArgs([]), { engine: undefined, engineVersion: undefined });
  assert.equal(parseArgs(['--engine', '/x']).engine, '/x');
  assert.equal(parseArgs(['--engine-version', '^0.7.0']).engineVersion, '^0.7.0');
  assert.throws(() => parseArgs(['--engine', '/x', '--engine-version', '^0.7.0']), /not both/);
  assert.throws(() => parseArgs(['--engine']), /needs a value/);
  assert.throws(() => parseArgs(['--bogus']), /Unknown argument/);
});

test('install test requires the four engine report steps to be done', () => {
  const steps = state => JSON.stringify({ steps: ['workspace', 'install', 'git', 'skills'].map(id => ({ id, state })) });
  assert.deepEqual(stepProblems(steps('done')), []);
  assert.equal(stepProblems(steps('todo')).length, 4);
  assert.equal(stepProblems('not json').length, 1);
});
