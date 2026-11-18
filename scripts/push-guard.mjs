#!/usr/bin/env node
// Usage: node scripts/push-guard.mjs [install|status|remove] [--root <repository>]
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, statSync, realpathSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { statePaths } from '../src/state.mjs';
import { loadConfig } from '../src/config.mjs';
import { withWorkspaceLock } from '../src/lock.mjs';
const mark = 'excudo-works private clone push guard';
const within = (root, path) => { const value = relative(root, path); return value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value); };
function real(path) { if (existsSync(path)) return realpathSync(path); return join(real(dirname(path)), path.slice(dirname(path).length + 1)); }
export function pushGuard(subject, action = false) {
  const root = statePaths(subject).root, mode = action === true ? 'install' : action || 'status';
  return mode === 'status' ? guard(root, mode) : withWorkspaceLock(subject, () => guard(root, mode));
}
function guard(root, action) {
  const git = args => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  const result = git(['rev-parse', '--git-common-dir']);
  if (result.status !== 0) throw new Error('Initialize git before installing the push guard.');
  const gitDir = real(resolve(root, result.stdout.trim()));
  const local = git(['config', '--local', '--get', 'core.hooksPath']);
  const effective = git(['config', '--get', 'core.hooksPath']);
  const configured = local.status === 0 ? local.stdout.trim() : effective.status === 0 ? effective.stdout.trim() : join(gitDir, 'hooks');
  const hooks = resolve(root, configured), safe = within(gitDir, real(hooks));
  if (!safe) {
    const message = 'Refused: hooks must resolve inside this repository git directory. Set a repository-local core.hooksPath to its git hooks folder, then retry; global and tracked hook folders are preserved.';
    if (action !== 'status') throw new Error(message);
    return { installed: false, refused: true, detail: message };
  }
  const path = join(hooks, 'pre-push'), before = `${path}.before-works`;
  const ours = existsSync(path) && readFileSync(path, 'utf8').includes(mark);
  if (action === 'remove') {
    if (ours) { unlinkSync(path); if (existsSync(before)) renameSync(before, path); }
    return { installed: false, removed: ours, hook: path };
  }
  if (action === 'install' && !ours) {
    mkdirSync(hooks, { recursive: true });
    if (existsSync(path)) { if (existsSync(before)) throw new Error('A saved pre-push hook already exists; inspect it first.'); renameSync(path, before); }
    writeFileSync(path, `#!/bin/sh\n# ${mark}\necho "Push refused: this workspace is private. Export a reviewed public tree separately." >&2\nexit 1\n`, { mode: 0o755 });
  }
  if (action === 'install') chmodSync(path, 0o755);
  const executable = process.platform === 'win32' || existsSync(path) && (statSync(path).mode & 0o111) !== 0;
  return { installed: (ours || action === 'install') && executable, hook: path };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: { root: { type: 'string' } } });
    const action = positionals[0] ?? 'install'; if (!['install', 'status', 'remove'].includes(action)) throw new Error('Use install, status or remove.');
    const root = resolve(values.root ?? '.');
    let subject = root;
    if (existsSync(join(root, 'excudo.config.mjs'))) subject = await loadConfig(root);
    console.log(JSON.stringify(pushGuard(subject, action)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
