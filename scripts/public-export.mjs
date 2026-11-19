#!/usr/bin/env node
// Usage: node scripts/public-export.mjs --out <public clone> [--list <denylist file>] [--ref <tag or commit>]
// The exported commit (HEAD, or --ref) must carry the tag v<package version>.
// Replaces the clone's tracked files with the committed HEAD of this repository, keeps its .git,
// scans the result with the private list and prints the next commands. It never commits or pushes.
import { existsSync, readFileSync, rmSync, readdirSync, rmdirSync, lstatSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { sync, shellQuote } from '../src/process.mjs';
import { scan, walkEntries } from './denylist.mjs';

const git = (cwd, args, extra) => sync('git', args, cwd, { timeout: 120000, ...extra });

// Compare repository addresses the way npm writes them and git reports them.
export function normalizeRepoUrl(url) {
  let text = String(url ?? '').trim().replace(/^git\+/, '').replace(/\/+$/, '').replace(/\.git$/i, '');
  const scp = /^[\w.-]+@([^:/]+):(.+)$/.exec(text); if (scp) text = `https://${scp[1]}/${scp[2]}`;
  text = text.replace(/^(?:ssh|git):\/\/(?:[\w.-]+@)?/, 'https://').replace(/^https?:\/\/(?:[^@/]+@)?/i, 'https://');
  return text.replace(/\.git$/i, '').toLowerCase();
}
export function publicExport(source, out, list, scanner = scan, ref = 'HEAD') {
  source = resolve(source); out = resolve(out); list = resolve(list ?? join(source, 'private/denylist.txt'));
  if (source === out) throw new Error('The public clone must be a different folder from this repository.');
  if (!existsSync(join(out, '.git'))) throw new Error(`${out} is not a git clone (no .git).`);
  const head = git(source, ['rev-parse', '--verify', 'HEAD']);
  if (head.status !== 0) throw new Error('This repository has no commit to export.');
  const commit = git(source, ['rev-parse', '--verify', `${ref}^{commit}`]);
  if (commit.status !== 0) throw new Error(`${ref} is not a commit in this repository.`);
  const sha = commit.stdout.trim(), shown = git(source, ['show', `${sha}:package.json`]);
  if (shown.status !== 0) throw new Error(`${ref} has no package.json.`);
  const releaseVersion = JSON.parse(shown.stdout).version, tag = `v${releaseVersion}`;
  const tagged = git(source, ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`]);
  if (tagged.status !== 0 || tagged.stdout.trim() !== sha) throw new Error(`The tag ${tag} must point at ${ref} (${sha.slice(0, 12)}). Verify gitHead, run git tag ${tag}, or pass --ref ${tag}.`);
  const dirty = git(source, ['status', '--porcelain']);
  if (dirty.status !== 0 || dirty.stdout.trim()) throw new Error('Commit or discard every change here before exporting; the export uses the committed HEAD only.');
  const clone = git(out, ['status', '--porcelain']);
  if (clone.status !== 0 || clone.stdout.trim()) throw new Error('The public clone has uncommitted changes; commit or discard them first.');
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')), expected = manifest.repository?.url ?? manifest.repository;
  const origin = git(out, ['remote', 'get-url', 'origin']);
  if (origin.status !== 0) throw new Error('The public clone has no origin remote.');
  if (!expected || normalizeRepoUrl(origin.stdout) !== normalizeRepoUrl(expected)) throw new Error(`The clone's origin does not match repository.url in package.json; export only into a clone of that repository.`);
  if (!existsSync(list)) throw new Error('The private denylist is missing; an export must be scanned. Create private/denylist.txt or pass --list <file>.');
  const archive = git(source, ['archive', '--format=tar', sha], { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 });
  if (archive.status !== 0) throw new Error('git archive failed.');
  const tracked = git(out, ['ls-files', '-z']).stdout.split('\0').filter(Boolean);
  const known = new Set(tracked); for (const file of tracked) for (let dir = dirname(file); dir !== '.' && dir !== '/'; dir = dirname(dir)) known.add(dir);
  const clash = new Set(), created = new Set();
  // Unpack the archive into a temporary folder and walk it: the walk gives the exact names (tar -t escapes tabs, newlines and backslashes).
  // The same tree is scanned, so the files checked are the files exported.
  const temp = mkdtempSync(join(tmpdir(), 'works-export-scan-'));
  let before;
  try {
    const staged = sync('tar', ['-x', '-f', '-', '-C', temp], temp, { input: archive.stdout, encoding: 'buffer', timeout: 120000 });
    if (staged.status !== 0) throw new Error('Unpacking the archive for the scan failed.');
    // Refuse before the clone changes when the archive would overwrite a file the clone does not track (untracked or ignored).
    for (const entry of walkEntries(temp)) {
      const parts = entry.name.split('/');
      for (let i = 1; i <= parts.length; i++) {
        const name = parts.slice(0, i).join('/'); let stat;
        try { stat = lstatSync(join(out, name)); } catch { for (let j = i; j <= parts.length; j++) created.add(parts.slice(0, j).join('/')); break; }
        // An untracked folder is fine as a parent or when the archive has the same folder; anything else untracked is overwritten.
        if (known.has(name) || stat.isDirectory() && (i < parts.length || entry.dir)) continue;
        clash.add(name); break;
      }
    }
    if (clash.size) throw new Error(`The export would overwrite files in the clone that git does not track: ${[...clash].slice(0, 10).map(name => JSON.stringify(name)).join(', ')}${clash.size > 10 ? ` and ${clash.size - 10} more` : ''}. Move or remove them, then export again; the clone was not touched.`);
    before = scanner(temp, list, { walk: true });
  } finally { rmSync(temp, { recursive: true, force: true }); }
  if (!before.ok) return { ok: false, stage: 'source', found: before.found, commands: [], restored: null };
  // From here the clone changes; any failure puts it back, which is exact because it was clean before.
  // Paths the unpack creates that did not exist before are removed by name, since clean -fd keeps ignored ones.
  const removeCreated = () => {
    for (const name of [...created].sort((a, b) => b.split('/').length - a.split('/').length)) {
      const path = join(out, name);
      try { if (lstatSync(path).isDirectory()) { if (readdirSync(path).length === 0) rmdirSync(path); } else rmSync(path, { force: true }); } catch {}
    }
    return [...created].every(name => !existsSync(join(out, name)));
  };
  const restore = () => removeCreated() && git(out, ['checkout', '--', '.']).status === 0 && git(out, ['clean', '-fd']).status === 0;
  let privacy, restored = null, version;
  try {
    // Remove only what the clone tracks, then unpack; a leftover empty folder is pruned.
    for (const file of tracked) {
      rmSync(join(out, file), { force: true });
      for (let dir = dirname(join(out, file)); dir !== out && dir.startsWith(out); dir = dirname(dir)) { try { if (readdirSync(dir).length === 0) rmdirSync(dir); else break; } catch { break; } }
    }
    const unpack = sync('tar', ['-x', '-f', '-', '-C', out], out, { input: archive.stdout, encoding: 'buffer', timeout: 120000 });
    if (unpack.status !== 0) throw new Error('Unpacking the archive failed.');
    privacy = scanner(out, list);
    if (!privacy.ok) restored = restore();
    else version = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8')).version;
  } catch (error) {
    const done = restore();
    throw new Error(`${error.message} ${done ? 'The clone was restored.' : `Restore the clone with: git -C ${shellQuote(out)} checkout -- . && git -C ${shellQuote(out)} clean -fd`}`);
  }
  const folder = shellQuote(out);
  return {
    ok: privacy.ok, stage: privacy.ok ? undefined : 'clone', restored, version, out, privacy: privacy.ok ? 'passed' : 'failed', found: privacy.found,
    commands: privacy.ok ? [`git -C ${folder} add -A`, `git -C ${folder} commit -m "Excudo Works ${version}"`, `git -C ${folder} push`] : [],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { out: { type: 'string' }, list: { type: 'string' }, ref: { type: 'string' } } });
    if (!values.out) throw new Error('Usage: node scripts/public-export.mjs --out <public clone> [--list <denylist file>] [--ref <tag or commit>]');
    const result = publicExport(fileURLToPath(new URL('..', import.meta.url)), values.out, values.list, undefined, values.ref);
    if (!result.ok) {
      console.error(result.stage === 'source' ? 'Denylist scan failed in this repository; the clone was not touched. Fix the source, commit and export again.' : `Denylist scan failed on the exported tree. ${result.restored ? 'The clone was restored.' : `Restore the clone before anything else:\n  git -C ${shellQuote(result.out)} checkout -- .\n  git -C ${shellQuote(result.out)} clean -fd`}`);
      for (const hit of result.found) console.error(`  ${hit.file}${hit.line ? `:${hit.line}` : ` (${hit.kind})`}`);
      process.exitCode = 1;
    } else console.log(`Exported ${result.version} to ${result.out} (denylist: ${result.privacy}).\nReview the tree, then run:\n${result.commands.map(c => `  ${c}`).join('\n')}\nThe owner pushes; this script never does.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
