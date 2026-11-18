import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { scan } from '../scripts/denylist.mjs';
import { pushGuard } from '../scripts/push-guard.mjs';
test('private denylist accepts this tree with the maintainer list present', () => assert.equal(scan(resolve('.')).ok, true));
test('denylist passes without a list and rejects tracked content and filenames without echoing restricted words', t => {
  const root = mkdtempSync(join(tmpdir(), 'works-privacy-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(spawnSync('git', ['init', root]).status, 0);
  writeFileSync(join(root, 'safe.txt'), 'A RestrictedPhrase appears here.'); spawnSync('git', ['-C', root, 'add', 'safe.txt']);
  assert.equal(scan(root).skipped, true);
  mkdirSync(join(root, 'private')); writeFileSync(join(root, '.gitignore'), 'private/\n'); writeFileSync(join(root, 'private/denylist.txt'), '# local only\nrestrictedphrase\n');
  const result = scan(root); assert.equal(result.ok, false); assert.equal(result.found[0].line, 1); assert.equal(JSON.stringify(result).includes('restrictedphrase'), false);
  writeFileSync(join(root, 'safe.txt'), 'Safe'); writeFileSync(join(root, 'RestrictedPhrase.txt'), 'Safe'); assert.ok(scan(root).found.some(x => x.kind === 'path'));
});
test('push guard refuses push and preserves an existing hook', t => {
  const root = mkdtempSync(join(tmpdir(), 'works-guard-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  spawnSync('git', ['init', root]); const hook = join(root, '.git/hooks/pre-push'); writeFileSync(hook, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const result = pushGuard(root, true); assert.equal(result.installed, true); assert.equal(existsSync(`${hook}.before-works`), true);
  assert.equal(readFileSync(`${hook}.before-works`, 'utf8'), '#!/bin/sh\nexit 0\n');
  assert.equal(pushGuard(root, true).installed, true);
  const gitShell = process.platform === 'win32' ? 'sh' : '/bin/sh';
  assert.equal(spawnSync(gitShell, [result.hook], { encoding: 'utf8' }).status, 1);
});
