#!/usr/bin/env node
// Usage: node scripts/engine-link.mjs [status] | local [path] | registry
// Development only: package.json always keeps the registry range; this changes node_modules alone.
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { runCommand } from '../src/process.mjs';
import { satisfies } from '../src/package-info.mjs';

const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return undefined; } };

// Describe the engine installed under node_modules: registry (npmjs), other-registry (another registry or mirror), link (symlink or junction), local (non-registry install) or missing.
export function engineState(root) {
  const path = join(root, 'node_modules/excudo');
  let stat; try { stat = lstatSync(path); } catch {}
  if (!stat) return { kind: 'missing' };
  const info = readJson(join(path, 'package.json'));
  const version = info?.version;
  if (stat.isSymbolicLink()) { let target; try { target = realpathSync(path); } catch {} return { kind: 'link', version, target }; }
  const entry = readJson(join(root, 'node_modules/.package-lock.json'))?.packages?.['node_modules/excudo'];
  const resolved = entry?.resolved;
  if (entry?.link || (typeof resolved === 'string' && !/^https?:\/\//.test(resolved))) return { kind: 'local', version, resolved };
  if (typeof resolved === 'string' && !/^https:\/\/registry\.npmjs\.org\//.test(resolved)) { let host = resolved; try { host = new URL(resolved).host; } catch {} return { kind: 'other-registry', version, resolved, host }; }
  return { kind: 'registry', version };
}

// Problems that keep a release from testing against a published engine; empty when it does.
export function engineProblems(root, range) {
  const state = engineState(root);
  if (state.kind === 'missing') return ['The engine is not installed; run npm install.'];
  if (state.kind === 'link') return ['node_modules/excudo is a link to a local engine; run npm run engine:registry.'];
  if (state.kind === 'other-registry') return [`node_modules/excudo was installed from ${state.host}, not the npmjs registry; reinstall it from the npmjs registry with npm run engine:registry.`];
  if (state.kind === 'local') return ['node_modules/excudo is a local install; run npm run engine:registry.'];
  if (!satisfies(state.version, range)) return [`Installed engine ${state.version ?? 'of unknown version'} does not satisfy ${range}; run npm run engine:registry.`];
  return [];
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const install = (root, args) => runCommand(npm, ['install', '--no-save', ...args], { cwd: root, timeoutMs: 300000, shell: process.platform === 'win32' });
export const describe = state => state.kind === 'missing' ? 'Engine: not installed.'
  : state.kind === 'other-registry' ? `Engine: version ${state.version ?? 'unknown'} installed from ${state.host}, not the npmjs registry. Reinstall it from the npmjs registry with npm run engine:registry.`
  : state.kind === 'registry' ? `Engine: registry release ${state.version}.`
  : `Engine: local ${state.kind === 'link' ? `link to ${state.target ?? 'a missing folder'}` : `install from ${state.resolved}`} (version ${state.version ?? 'unknown'}). Not for release.`;

export async function engineLink(root, [mode = 'status', arg] = []) {
  const manifest = readJson(join(root, 'package.json')), range = manifest?.peerDependencies?.excudo;
  if (typeof range !== 'string') throw new Error('package.json has no engine peer range.');
  if (mode === 'status') return { ok: true, message: describe(engineState(root)) };
  if (mode === 'local') {
    const folder = resolve(root, arg ?? '../excudo');
    if (readJson(join(folder, 'package.json'))?.name !== 'excudo') throw new Error(`${folder} is not an Excudo engine clone.`);
    const result = await install(root, [folder]);
    if (result.code !== 0) throw new Error(result.output.slice(-2000));
    return { ok: true, message: describe(engineState(root)) };
  }
  if (mode === 'registry') {
    const result = await install(root, ['--registry=https://registry.npmjs.org/', `excudo@${range}`]);
    if (result.code !== 0) throw new Error(result.output.slice(-2000));
    return { ok: true, message: describe(engineState(root)) };
  }
  throw new Error('Usage: engine-link.mjs [status] | local [path] | registry');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log((await engineLink(fileURLToPath(new URL('..', import.meta.url)), process.argv.slice(2))).message); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
