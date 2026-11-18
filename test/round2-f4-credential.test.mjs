import test from 'node:test';
import assert from 'node:assert/strict';
import { workspace } from './helpers.mjs';
import { doctor } from '../src/doctor.mjs';
import { passwordSource } from '../src/backup.mjs';
test('F4: the Windows credential helper runs with a process-scoped execution policy bypass', () => {
  const { command } = passwordSource({ credentialName: 'fixture' }, 'win32');
  const at = command.indexOf('-ExecutionPolicy'); assert.ok(at > 0); assert.equal(command[at + 1], 'Bypass'); assert.ok(at < command.indexOf('-File'));
});
test('F4: doctor runs the credential helper and reports its exit status without printing the secret', async t => {
  const ws = await workspace(t, { backup: { folder: 'archives', keychainService: 'fixture-service' } });
  const original = Object.getOwnPropertyDescriptor(process, 'platform'); Object.defineProperty(process, 'platform', { value: 'darwin' }); t.after(() => Object.defineProperty(process, 'platform', original));
  const calls = [];
  const probe = status => (command, args) => { calls.push([command, ...args]); return { status, stdout: status === 0 ? 'SECRET-VALUE' : '', stderr: '' }; };
  const good = await doctor(ws.root, { probe: probe(0) }), entry = good.checks.find(item => item.id === 'backup-password');
  assert.equal(entry.status, 'ok'); assert.ok(calls.some(call => call[0] === 'security' && call.includes('fixture-service')));
  assert.equal(JSON.stringify(good).includes('SECRET-VALUE'), false);
  const bad = await doctor(ws.root, { probe: probe(1) }); assert.equal(bad.checks.find(item => item.id === 'backup-password').status, 'warning');
});
