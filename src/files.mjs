import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, readdirSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
export function readJSON(file, fallback) {
  if (!existsSync(file)) return structuredClone(fallback);
  return JSON.parse(readFileSync(file, 'utf8'));
}
export function atomic(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  writeFileSync(tmp, content, { mode: 0o600 });
  renameSync(tmp, file);
}
export const json = (file, data) => atomic(file, `${JSON.stringify(data, null, 2)}\n`);
export function inside(root, name) {
  const path = resolve(root, name);
  const rel = relative(resolve(root), path);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('Path must stay inside the workspace.');
  let ancestor = path;
  while (!existsSync(ancestor) && dirname(ancestor) !== ancestor) ancestor = dirname(ancestor);
  const realRoot = realpathSync(root);
  const actual = relative(realRoot, realpathSync(ancestor));
  if (actual === '..' || actual.startsWith(`..${sep}`) || isAbsolute(actual)) throw new Error('Symlink leaves the workspace.');
  return path;
}
export function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap(name => {
    const file = join(dir, name), stat = lstatSync(file);
    return stat.isSymbolicLink() ? [] : stat.isDirectory() ? files(file) : [file];
  });
}
