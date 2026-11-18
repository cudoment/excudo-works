import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { workspace } from './helpers.mjs';
import { initWorkspace } from '../src/init.mjs';
import { update } from '../src/update.mjs';
const read = file => readFileSync(file, 'utf8');
// Installs a stand-in for the next release: one more skill and one more records migration.
function installNextRelease(root) {
  const target = join(root, 'node_modules/excudo-works');
  mkdirSync(target, { recursive: true });
  for (const name of ['bin', 'src', 'skills', 'template', 'scripts', 'package.json', 'CHANGELOG.md']) cpSync(resolve(name), join(target, name), { recursive: true });
  const pkg = JSON.parse(read(join(target, 'package.json'))); pkg.version = '0.2.0'; writeFileSync(join(target, 'package.json'), JSON.stringify(pkg));
  const names = join(target, 'src/skill-check.mjs'); writeFileSync(names, read(names).replace("export const skillNames = ['works-daily',", "export const skillNames = ['works-next-extra', 'works-daily',"));
  mkdirSync(join(target, 'skills/works-next-extra'), { recursive: true }); writeFileSync(join(target, 'skills/works-next-extra/SKILL.md'), '# next\n');
  const state = join(target, 'src/state.mjs'), text = read(state);
  assert.ok(text.includes("records: { version: 2,")); writeFileSync(state, text.replace("records: { version: 2,", "records: { version: 3,").replace("value => ({ ...value, version: 2, manual: value.manual ?? null })]", "value => ({ ...value, version: 2, manual: value.manual ?? null }), value => ({ ...value, version: 3, fromNextRelease: true })]"));
}
test('F1: update --apply refreshes links and migrations with the newly installed release', async t => {
  const ws = await workspace(t); await initWorkspace(ws.root);
  const result = await update(ws, { apply: true, registry: { code: 0, output: '"0.2.0"' }, execute: async (command, args) => { assert.ok(args.includes('install')); installNextRelease(ws.root); return { code: 0, output: '' }; } });
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.applied, true);
  assert.equal(JSON.parse(read(join(ws.root, '.excudo/works/records.json'))).fromNextRelease, true);
  assert.ok(lstatSync(join(ws.root, '.agents/skills/works-next-extra')).isSymbolicLink());
  assert.equal(existsSync(join(ws.root, '.excudo/works/run.lock')), false);
});
test('F1: a failed refresh in the new release reports the printed follow-up command', async t => {
  const ws = await workspace(t); await initWorkspace(ws.root);
  const result = await update(ws, { apply: true, registry: { code: 0, output: '"0.2.0"' }, execute: async () => { installNextRelease(ws.root); writeFileSync(join(ws.root, 'node_modules/excudo-works/src/update.mjs'), 'throw new Error("broken release");'); return { code: 0, output: '' }; } });
  assert.equal(result.ok, false); assert.match(result.detail, /excudo-works update/); assert.equal(existsSync(join(ws.root, '.excudo/works/run.lock')), false);
});
test('F3: the refresh launch interface of 0.1.0 stays fixed and ignores extra stdout', async t => {
  const ws = await workspace(t); await initWorkspace(ws.root); let launched;
  const result = await update(ws, { apply: true, force: true, registry: { code: 0, output: '"0.2.0"' }, execute: async () => ({ code: 0, output: '' }), launch: async (command, args, options) => {
    launched = { command, args, env: options.env };
    writeFileSync(options.env.EXCUDO_WORKS_RESULT_FILE, JSON.stringify({ ok: true, records: 2, links: [], instructions: [] }));
    return { code: 0, output: 'A notice before any JSON\n{"ok":false}' };
  } });
  assert.equal(launched.command, process.execPath);
  assert.deepEqual(launched.args, [join(ws.root, 'node_modules/excudo-works/bin/excudo-works.mjs'), 'update', '--refresh-only', '--root', ws.root, '--force']);
  assert.deepEqual(Object.keys(launched.env).sort(), ['EXCUDO_WORKS_LOCK_ROOT', 'EXCUDO_WORKS_LOCK_TOKEN', 'EXCUDO_WORKS_RESULT_FILE']);
  assert.equal(result.ok, true); assert.equal(result.applied, true);
});
test('F4: a successful apply keeps the registry facts and attaches the refresh result', async t => {
  const ws = await workspace(t); await initWorkspace(ws.root);
  const result = await update(ws, { apply: true, registry: { code: 0, output: '"0.2.0"' }, execute: async () => { installNextRelease(ws.root); return { code: 0, output: '' }; } });
  assert.equal(result.latest, '0.2.0'); assert.equal(result.offline, false); assert.match(result.commands[0], /excudo-works@0\.2\.0/);
  assert.equal(result.refreshed.ok, true); assert.equal(result.refreshed.records, 3);
});
test('F3: the child writes its result file when the environment names one', async t => {
  const ws = await workspace(t); await initWorkspace(ws.root); const file = join(ws.root, 'result.json');
  const { spawnSync } = await import('node:child_process');
  const run = spawnSync(process.execPath, [resolve('bin/excudo-works.mjs'), 'update', '--refresh-only', '--root', ws.root], { encoding: 'utf8', env: { ...process.env, EXCUDO_WORKS_RESULT_FILE: file } });
  assert.equal(run.status, 0, run.stderr); assert.equal(JSON.parse(read(file)).ok, true);
});
