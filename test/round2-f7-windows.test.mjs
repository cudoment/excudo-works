import test from 'node:test';
import assert from 'node:assert/strict';
import { workspace } from './helpers.mjs';
import { windowsCommand } from '../src/process.mjs';
import { doctor } from '../src/doctor.mjs';
const shim = '@ECHO off\r\nSET dp0=%~dp0\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@vendor\\cli\\bin\\cli.js" %*\r\n';
const found = { 'C:\\npm\\codex': ['C:\\npm\\codex', 'C:\\npm\\codex.cmd'], 'C:x': [] };
test('F7: an npm .cmd shim is run through node with its script and untouched arguments', () => {
  const resolved = windowsCommand('codex', ['exec', 'a b "c"'], { find: () => found['C:\\npm\\codex'], read: () => shim, exists: () => true, node: 'C:\\node\\node.exe' });
  assert.equal(resolved.command, 'C:\\node\\node.exe'); assert.equal(resolved.shell, false);
  assert.deepEqual(resolved.args, ['C:\\npm\\node_modules\\@vendor\\cli\\bin\\cli.js', 'exec', 'a b "c"']);
});
test('F7: an .exe is used as found, and an unreadable .cmd falls back to a quoted shell command', () => {
  assert.deepEqual(windowsCommand('claude', ['-p'], { find: () => ['C:\\bin\\claude.exe'] }), { command: 'C:\\bin\\claude.exe', args: ['-p'], shell: false });
  const fallback = windowsCommand('claude', ['--allowed-tools', 'Bash(npx --no-install excudo:*)', 'say "hi"'], { find: () => ['C:\\npm\\claude.cmd'], read: () => '@echo off\r\nunknown\r\n', exists: () => false });
  assert.equal(fallback.shell, true); assert.equal(fallback.command, '"C:\\npm\\claude.cmd"'); assert.deepEqual(fallback.args, ['"--allowed-tools"', '"Bash(npx --no-install excudo:*)"', '"say ""hi"""']);
});
test('F7: paths, explicit extensions and missing commands are left alone', () => {
  assert.equal(windowsCommand('C:\\tool\\x.exe', ['a'], { find: () => { throw new Error('unused'); } }).command, 'C:\\tool\\x.exe');
  assert.deepEqual(windowsCommand('nothing', ['a'], { find: () => [] }), { command: 'nothing', args: ['a'], shell: false });
});
test('F7: doctor reports a missing worker CLI', async t => {
  const ws = await workspace(t); const { writeFileSync } = await import('node:fs'); const { join } = await import('node:path');
  writeFileSync(join(ws.root, 'excudo.config.mjs'), `export default ${JSON.stringify({ graph: 'notes', agents: { worker: { tool: 'claude' }, reviewers: [{ tool: 'codex' }] }, works: { principles: false, idle: false } })}`);
  const probe = command => ({ status: ['which', 'where'].includes(command) ? 1 : 0, stdout: '' });
  const result = await doctor(ws.root, { probe });
  assert.equal(result.checks.find(item => item.id === 'worker-cli:claude').status, 'warning'); assert.equal(result.checks.find(item => item.id === 'worker-cli:codex').status, 'warning');
  const present = await doctor(ws.root, { probe: () => ({ status: 0, stdout: 'x' }) }); assert.equal(present.checks.find(item => item.id === 'worker-cli:claude').status, 'ok');
});
