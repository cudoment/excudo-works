#!/usr/bin/env node
// Usage: node scripts/denylist.mjs [--root <repository>] [--list <file>] [--json]
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, lstatSync, readlinkSync, readdirSync } from 'node:fs';
import { resolve, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// Every file under a folder, found by walking it; symbolic links are listed, never followed.
export function walkFiles(root, dir = root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(root, path) : [relative(root, path).split(sep).join('/')];
  });
}
// Every file and folder under a folder with its exact name, for callers that must not trust a tool's escaped listing.
export function walkEntries(root, dir = root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name), name = relative(root, path).split(sep).join('/');
    return entry.isDirectory() ? [{ name, dir: true }, ...walkEntries(root, path)] : [{ name, dir: false }];
  });
}
// With { walk: true } the files come from walking the folder instead of from git, for a tree that is not a repository.
export function scan(root, list = join(root, 'private/denylist.txt'), { walk = false } = {}) {
  if (!existsSync(list)) return { ok: true, skipped: true, found: [] };
  const words = readFileSync(list, 'utf8').split(/\r?\n/).map(s => s.replace(/#.*$/, '').trim().normalize('NFC').toLowerCase()).filter(Boolean);
  let files;
  if (walk) files = walkFiles(root);
  else {
    const git = spawnSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (git.status !== 0) throw new Error('Cannot list repository files.');
    files = git.stdout.split('\0').filter(Boolean);
  }
  const has = text => words.some(word => text.normalize('NFC').toLowerCase().includes(word));
  const found = [];
  for (const file of new Set(files)) {
    if (has(file)) found.push({ file, kind: 'path' });
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const data = lstatSync(path).isSymbolicLink() ? Buffer.from(readlinkSync(path)) : readFileSync(path);
    if (data.includes(0)) continue;
    data.toString('utf8').split('\n').forEach((line, i) => { if (has(line)) found.push({ file, line: i + 1 }); });
  }
  return { ok: found.length === 0, skipped: false, found };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { root: { type: 'string' }, list: { type: 'string' }, json: { type: 'boolean' } } });
    const root = resolve(values.root ?? fileURLToPath(new URL('..', import.meta.url)));
    const result = scan(root, values.list ? resolve(root, values.list) : undefined);
    console.log(values.json ? JSON.stringify(result) : result.ok ? `Denylist: passed${result.skipped ? ' (no private list)' : ''}.` : result.found.map(x => `${x.file}:${x.line ?? 'path'}: restricted content`).join('\n'));
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
