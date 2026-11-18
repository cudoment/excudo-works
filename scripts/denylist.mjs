#!/usr/bin/env node
// Usage: node scripts/denylist.mjs [--root <repository>] [--list <file>] [--json]
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, lstatSync, readlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export function scan(root, list = join(root, 'private/denylist.txt')) {
  if (!existsSync(list)) return { ok: true, skipped: true, found: [] };
  const words = readFileSync(list, 'utf8').split(/\r?\n/).map(s => s.replace(/#.*$/, '').trim().normalize('NFC').toLowerCase()).filter(Boolean);
  const git = spawnSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (git.status !== 0) throw new Error('Cannot list repository files.');
  const has = text => words.some(word => text.normalize('NFC').toLowerCase().includes(word));
  const found = [];
  for (const file of new Set(git.stdout.split('\0').filter(Boolean))) {
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
