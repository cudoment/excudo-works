import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { workspace } from './helpers.mjs';
import { backup, restore, encryptArchive, decryptArchive } from '../src/backup.mjs';
test('encrypted archive authenticates contents and rejects wrong passwords or tampering', () => {
  const value = [{ path: 'notes/Plan.md', mode: 0o600, data: Buffer.from('A plan').toString('base64') }];
  const password = randomBytes(24).toString('hex'), archive = encryptArchive(value, password);
  assert.deepEqual(decryptArchive(archive, password).files, value); assert.equal(archive.includes(Buffer.from('A plan')), false);
  assert.throws(() => decryptArchive(archive, randomBytes(24).toString('hex')), /authentication/);
  archive[archive.length - 1] ^= 1; assert.throws(() => decryptArchive(archive, password), /authentication/);
});
test('backup uses an engine-consistent cache, excludes dependencies and restores separately', async t => {
  const variable = 'WORKS_TEST_BACKUP_PASSPHRASE'; process.env[variable] = randomBytes(24).toString('hex'); t.after(() => { delete process.env[variable]; });
  const ws = await workspace(t, { backup: { folder: 'archives', passwordEnv: variable } });
  mkdirSync(join(ws.root, '.excudo')); mkdirSync(join(ws.root, 'node_modules')); mkdirSync(join(ws.root, '.git'));
  writeFileSync(join(ws.root, '.excudo/records.db'), 'inconsistent-live-copy');
  writeFileSync(join(ws.root, 'notes/Plan.md'), '- DOING Test backup\n');
  writeFileSync(join(ws.root, 'node_modules/skip.txt'), 'skip'); writeFileSync(join(ws.root, '.git/config'), 'skip');
  if (process.platform !== 'win32') symlinkSync(join(ws.root, 'notes/Plan.md'), join(ws.root, 'linked.md'));
  const saved = await backup(ws, new Date('2030-01-01'), { engineBackup: async folder => { writeFileSync(join(folder, 'records.db'), 'consistent-copy'); return { code: 0 }; } });
  const restoredParent = mkdtempSync(join(tmpdir(), 'works-restored-')); t.after(() => rmSync(restoredParent, { recursive: true, force: true }));
  const target = join(restoredParent, 'review'); restore(ws, saved.file, target);
  assert.equal(readFileSync(join(target, '.excudo/records.db'), 'utf8'), 'consistent-copy');
  assert.equal(existsSync(join(target, 'node_modules')), false); assert.equal(existsSync(join(target, '.git')), false); assert.equal(existsSync(join(target, 'linked.md')), false);
  assert.equal(readFileSync(join(target, 'notes/Plan.md'), 'utf8'), '- DOING Test backup\n');
  assert.throws(() => restore(ws, saved.file, target), /new folder/); assert.throws(() => restore(ws, saved.file, join(ws.root, 'restore')), /separate/);
});
test('unsafe archive entries and failed engine cache backups never create a destination', async t => {
  const variable = 'WORKS_TEST_BACKUP_SECRET'; process.env[variable] = randomBytes(24).toString('hex'); t.after(() => { delete process.env[variable]; });
  const ws = await workspace(t, { backup: { folder: 'archives', passwordEnv: variable } });
  await assert.rejects(backup(ws, new Date(), { engineBackup: async () => ({ code: 1 }) }), /no archive/);
  assert.equal(existsSync(join(ws.root, 'archives')), false);
  const bad = join(ws.root, 'bad.ewb'); writeFileSync(bad, encryptArchive([{ path: '../escape', data: '' }], process.env[variable]));
  assert.throws(() => restore(ws, bad, `${ws.root}-review`), /Unsafe/); assert.equal(existsSync(`${ws.root}-review`), false);
});
