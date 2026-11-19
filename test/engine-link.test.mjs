import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { engineState, engineProblems, describe } from '../scripts/engine-link.mjs';

function fixture(t, { version = '0.7.0', link = false, lock } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'works-engine-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const real = join(root, link ? 'clone' : 'node_modules/excudo'); mkdirSync(real, { recursive: true });
  writeFileSync(join(real, 'package.json'), JSON.stringify({ name: 'excudo', version }));
  if (link) { mkdirSync(join(root, 'node_modules')); symlinkSync(real, join(root, 'node_modules/excudo'), 'dir'); }
  if (lock) writeFileSync(join(root, 'node_modules/.package-lock.json'), JSON.stringify({ packages: { 'node_modules/excudo': lock } }));
  return root;
}

test('a published engine inside the peer range passes', t => {
  const registry = { resolved: 'https://registry.npmjs.org/excudo/-/excudo-0.7.0.tgz' };
  for (const lock of [undefined, registry]) assert.deepEqual(engineProblems(fixture(t, { lock }), '^0.7.0'), []);
  assert.equal(engineState(fixture(t, { lock: registry })).kind, 'registry');
});

test('a linked engine fails and status names it', t => {
  const root = fixture(t, { link: true });
  assert.equal(engineState(root).kind, 'link');
  assert.match(engineProblems(root, '^0.7.0')[0], /link to a local engine/);
  assert.match(describe(engineState(root)), /link to .*clone.*Not for release/);
});

test('a local install fails', t => {
  for (const lock of [{ link: true, resolved: '../excudo' }, { resolved: 'file:../excudo-0.7.0.tgz' }]) {
    const root = fixture(t, { lock });
    assert.equal(engineState(root).kind, 'local');
    assert.match(engineProblems(root, '^0.7.0')[0], /local install/);
  }
});

test('an engine from another registry fails and says to reinstall from npmjs', t => {
  const root = fixture(t, { lock: { resolved: 'https://registry.mirror.example/excudo/-/excudo-0.7.0.tgz' } });
  assert.equal(engineState(root).kind, 'other-registry');
  assert.match(engineProblems(root, '^0.7.0')[0], /registry\.mirror\.example, not the npmjs registry; reinstall it from the npmjs registry/);
  assert.match(describe(engineState(root)), /not the npmjs registry.*Reinstall it from the npmjs registry/);
});

test('a version outside the peer range or a missing engine fails', t => {
  assert.match(engineProblems(fixture(t, { version: '0.8.0' }), '^0.7.0')[0], /does not satisfy \^0\.7\.0/);
  const empty = mkdtempSync(join(tmpdir(), 'works-engine-')); t.after(() => rmSync(empty, { recursive: true, force: true }));
  assert.equal(engineState(empty).kind, 'missing');
  assert.match(engineProblems(empty, '^0.7.0')[0], /not installed/);
});
