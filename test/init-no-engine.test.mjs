import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { initWorkspace, engineMissing } from '../src/init.mjs';
import { packageInfo } from '../src/package-info.mjs';

function withEngine(t, source) {
  const base = mkdtempSync(join(tmpdir(), 'works-noengine-'));
  const script = join(base, 'engine.mjs'); writeFileSync(script, source);
  const previous = process.env.EXCUDO_WORKS_ENGINE_SCRIPT; process.env.EXCUDO_WORKS_ENGINE_SCRIPT = script;
  t.after(() => { if (previous === undefined) delete process.env.EXCUDO_WORKS_ENGINE_SCRIPT; else process.env.EXCUDO_WORKS_ENGINE_SCRIPT = previous; rmSync(base, { recursive: true, force: true }); });
  return base;
}
const missing = "console.error('npm error could not determine executable to run'); process.exit(1);";

test('init without an engine prints the Start commands in order and leaves no empty folder', async t => {
  const base = withEngine(t, missing), folder = join(base, 'my-work');
  const result = await initWorkspace(folder, { locale: 'ko' });
  const info = packageInfo();
  assert.equal(result.ok, false); assert.equal(result.reason, 'no-engine');
  assert.deepEqual(result.commands, [
    `npx -y excudo@${info.peerDependencies.excudo} init '${folder}' --locale ko`,
    `cd '${folder}'`,
    'npm install',
    'git init',
    'npx --no-install excudo start --report --json',
    `npm install --save-dev excudo-works@^${info.version}`,
    'npx --no-install excudo-works init . --locale ko',
  ]);
  assert.ok(result.commands.every(command => command === 'npm install' || !/^npm install\b(?!.*excudo-works@)/.test(command)));
  assert.match(result.output, /could not determine executable/);
  assert.equal(existsSync(folder), false);
});

test('an engine that runs and fails is reported as a failure with its output tail, without install commands', async t => {
  const base = withEngine(t, "console.error('x'.repeat(3000) + 'END-OF-ENGINE-OUTPUT'); process.exit(2);"), folder = join(base, 'my-work');
  const result = await initWorkspace(folder);
  assert.equal(result.ok, false); assert.equal(result.reason, 'engine-failed'); assert.deepEqual(result.commands, []);
  assert.ok(result.output.endsWith('END-OF-ENGINE-OUTPUT\n') || result.output.endsWith('END-OF-ENGINE-OUTPUT'));
  assert.equal(result.output.length, 2000);
  assert.equal(existsSync(folder), false);
});

test('init without an engine keeps a folder that already existed', async t => {
  const base = withEngine(t, missing), folder = join(base, 'existing'); mkdirSync(folder);
  const result = await initWorkspace(folder);
  assert.equal(result.ok, false);
  assert.equal(existsSync(folder), true);
});

test('engineMissing accepts only exit 127 and npm or npx phrases', () => {
  assert.equal(engineMissing({ code: 127, output: '' }), true);
  for (const output of ['npm error could not determine executable to run', 'npm error npx canceled due to missing packages', 'npm error code E404']) assert.equal(engineMissing({ code: 1, output }), true, output);
  for (const output of ['Workspace is not valid', 'config file not found', 'Error: spawn ENOENT', 'command not found: git']) assert.equal(engineMissing({ code: 1, output }), false, output);
});

const creating = "import { mkdirSync, writeFileSync } from 'node:fs'; import { join, isAbsolute } from 'node:path'; const root = process.argv[3]; mkdirSync(join(root, 'notes'), { recursive: true }); writeFileSync(join(root, 'excudo.config.mjs'), 'export default ' + JSON.stringify({ graph: 'notes', works: { principles: false, idle: false } }));";

test('install commands name the workspace when the engine succeeds from another folder', async t => {
  const base = withEngine(t, creating), folder = join(base, 'my-work');
  const result = await initWorkspace(folder);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.commands, [`cd '${folder}' && npm install --save-dev excudo-works@^${packageInfo().version}`, `cd '${folder}' && npm install`]);
});

test('install commands stay plain when the workspace is the current folder', async t => {
  const base = withEngine(t, creating), previous = process.cwd();
  t.after(() => process.chdir(previous)); process.chdir(base);
  const result = await initWorkspace('.');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.commands, [`npm install --save-dev excudo-works@^${packageInfo().version}`, 'npm install']);
});

test('install commands use the resolved folder so they run one after another from the same place', async t => {
  const base = withEngine(t, creating), previous = process.cwd();
  t.after(() => process.chdir(previous)); process.chdir(base);
  const result = await initWorkspace('my-work');
  assert.equal(result.ok, true, JSON.stringify(result));
  const root = realpathSync(join(base, 'my-work')), prefix = result.commands.map(command => /^cd '([^']+)' && /.exec(command)?.[1]);
  assert.equal(result.commands.length, 2);
  for (const folder of prefix) assert.equal(isAbsolute(folder), true, result.commands.join('\n'));
  assert.equal(realpathSync(prefix[0]), root); assert.equal(prefix[0], prefix[1]);
});
