import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, lstatSync, readdirSync, writeFileSync, rmSync, renameSync, mkdtempSync, realpathSync } from 'node:fs';
import { join, resolve, dirname, relative, sep, isAbsolute } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { atomic } from './files.mjs';
import { tmpdir } from 'node:os';
import { sync, engineRun } from './process.mjs';
import { fileURLToPath } from 'node:url';
import { withWorkspaceLock } from './lock.mjs';
import { statePaths, readState, writeState } from './state.mjs';
import { fingerprint } from './edits.mjs';
export function passwordSource(options, platform = process.platform) {
  if (platform === 'darwin' && options?.keychainService) return { kind: 'keychain', safeForSchedule: true, command: ['security', 'find-generic-password', '-s', options.keychainService, '-w'] };
  if (platform === 'linux' && options?.secretService) return { kind: 'secret-service', safeForSchedule: true, command: ['secret-tool', 'lookup', 'service', options.secretService] };
  if (platform === 'win32' && options?.credentialName) return { kind: 'credential-manager', safeForSchedule: true, command: ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./credential.ps1', import.meta.url)), options.credentialName] };
  if (options?.passwordEnv) return { kind: 'environment', safeForSchedule: options.scheduledEnvironment === true, variable: options.passwordEnv };
  return { kind: 'missing', safeForSchedule: false };
}
function secret(config) {
  const source = passwordSource(config);
  if (source.kind === 'environment') {
    if (process.env[source.variable]) return process.env[source.variable];
    throw new Error('The configured backup password environment variable is not set.');
  }
  if (source.command) {
    const [command, ...args] = source.command, result = sync(command, args);
    if (result.status === 0 && result.stdout) return result.stdout.replace(/\r?\n$/, '');
    throw new Error('The backup password could not be read from the configured OS credential store.');
  }
  throw new Error('Configure a backup password environment variable or OS credential store.');
}
const contains = (parent, child) => { const r = relative(parent, child); return !r || (!r.startsWith(`..${sep}`) && r !== '..' && !isAbsolute(r)); };
function archiveEntries(root, destination, cache) {
  const result = [];
  const walk = (dir, rel = '') => {
    for (const name of readdirSync(dir)) {
      if (['node_modules', '.git'].includes(name) || fileIsLiveCache(join(dir, name), cache)) continue;
      const file = join(dir, name), nameInArchive = join(rel, name), stat = lstatSync(file);
      if (stat.isSymbolicLink() || contains(destination, file)) continue;
      if (stat.isDirectory()) walk(file, nameInArchive);
      else if (stat.isFile()) result.push({ path: nameInArchive.split(sep).join('/'), mode: stat.mode & 0o777, absolute: file, size: stat.size });
    }
  };
  walk(root); return result;
}
export function encryptArchive(files, password) {
  const salt = randomBytes(16), iv = randomBytes(12), key = scryptSync(password, salt, 32);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(gzipSync(JSON.stringify({ version: 1, files }))), cipher.final()]);
    return Buffer.concat([Buffer.from('EWORKS01'), salt, iv, cipher.getAuthTag(), data]);
  } finally { key.fill(0); }
}
export function decryptArchive(buffer, password) {
  if (buffer.length < 52 || buffer.subarray(0, 8).toString() !== 'EWORKS01') throw new Error('Invalid backup archive.');
  const key = scryptSync(password, buffer.subarray(8, 24), 32);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, buffer.subarray(24, 36));
    decipher.setAuthTag(buffer.subarray(36, 52));
    const clear = Buffer.concat([decipher.update(buffer.subarray(52)), decipher.final()]);
    return JSON.parse(gunzipSync(clear, { maxOutputLength: 512 * 1024 * 1024 }).toString());
  } catch { throw new Error('Backup authentication failed or the archive is damaged.'); }
  finally { key.fill(0); }
}
function fileIsLiveCache(file, cache) {
  const rel = relative(cache, file).split(sep).join('/');
  return ['records.db', 'records.db-wal', 'records.db-shm'].includes(rel) || rel === 'works/run.lock' || rel.startsWith('works/run.lock/');
}
export async function backup(ws, now = new Date(), options = {}) { return withWorkspaceLock(ws, () => backupLocked(ws, now, options)); }
async function backupLocked(ws, now, { engineBackup } = {}) {
  const options = ws.config.backup;
  if (!options?.folder) throw new Error('Set works.backup.folder first.');
  const destination = resolve(ws.root, options.folder);
  if (contains(destination, ws.root)) throw new Error('Backup destination must not contain the workspace.');
  const cache = statePaths(ws).cache;
  const cacheRel = relative(ws.root, cache);
  if (!contains(ws.root, cache)) throw new Error('Backup requires the engine cache inside the workspace.');
  const maxBytes = options.maxBytes ?? 128 * 1024 * 1024;
  const initial = archiveEntries(ws.root, destination, cache);
  if (initial.reduce((sum, entry) => sum + entry.size, 0) > maxBytes) throw new Error('Backup exceeds maxBytes before reading input files.');
  const staging = mkdtempSync(join(tmpdir(), 'works-cache-'));
  try {
    const copied = engineBackup ? await engineBackup(staging) : await engineRun(ws.root, ['backup', staging], { timeoutMs: 30000 });
    if (copied.code !== 0) throw new Error('Engine cache backup failed; no archive was written.');
    const entries = archiveEntries(ws.root, destination, cache);
    const snapshot = archiveEntries(staging, destination, cache).map(entry => ({ ...entry, path: join(cacheRel, entry.path).split(sep).join('/') }));
    for (const entry of snapshot) {
      const at = entries.findIndex(old => old.path === entry.path);
      if (at >= 0) entries[at] = entry; else entries.push(entry);
    }
    const bytes = entries.reduce((sum, entry) => sum + entry.size, 0);
    if (bytes > maxBytes) throw new Error('Backup exceeds maxBytes; use an external encrypted backup step for larger workspaces.');
    const prefix = `workspace-${fingerprint(realpathSync(ws.root))}-`;
    const file = join(destination, `${prefix}${now.toISOString().replace(/[:.]/g, '-')}.ewb`);
    if (existsSync(file)) throw new Error('Backup already exists for this timestamp.');
    const files = entries.map(({ path, mode, absolute }) => ({ path, mode, data: readFileSync(absolute).toString('base64') }));
    atomic(file, encryptArchive(files, secret(options)));
    const keep = options.keep ?? 30;
    const archives = readdirSync(destination).filter(name => name.startsWith(prefix) && name.endsWith('.ewb') && lstatSync(join(destination, name)).isFile()).sort().reverse();
    for (const name of archives.slice(keep)) rmSync(join(destination, name));
    writeState(ws, 'backup', { ...readState(ws, 'backup'), at: now.toISOString(), file, files: files.length, keep });
    return { file, files: files.length };
  } finally { rmSync(staging, { recursive: true, force: true }); }
}
export function restore(ws, archive, target) { return withWorkspaceLock(ws, () => restoreLocked(ws, archive, target)); }
function restoreLocked(ws, archive, target) {
  const out = resolve(target);
  const canonicalParent = realpathSync(dirname(out));
  const actual = join(canonicalParent, out.slice(dirname(out).length + 1));
  const realRoot = realpathSync(ws.root);
  if (contains(realRoot, actual) || contains(actual, realRoot)) throw new Error('Restore requires a separate folder outside the workspace, including through symlinks.');
  if (contains(ws.root, out) || contains(out, ws.root) || existsSync(out)) throw new Error('Restore requires a new folder separate from the workspace.');
  const record = decryptArchive(readFileSync(archive), secret(ws.config.backup));
  if (record.version !== 1 || !Array.isArray(record.files)) throw new Error('Unsupported archive version.');
  const names = new Set();
  for (const file of record.files) {
    if (!file || typeof file.path !== 'string' || !file.path || file.path.includes('\\') || /^[A-Za-z]:/.test(file.path) || file.path.split('/').some(p => !p || p === '.' || p === '..') || isAbsolute(file.path) || typeof file.data !== 'string' || names.has(file.path)) throw new Error('Unsafe archive entry.');
    names.add(file.path);
  }
  const stage = `${out}.restore-${randomBytes(6).toString('hex')}`;
  mkdirSync(stage, { recursive: false, mode: 0o700 });
  try {
    for (const file of record.files) {
      const path = join(stage, file.path); mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, Buffer.from(file.data, 'base64'), { flag: 'wx', mode: file.mode & 0o700 });
    }
    if (existsSync(out)) throw new Error('Restore target appeared during extraction.');
    renameSync(stage, out);
  } finally { rmSync(stage, { recursive: true, force: true }); }
  writeState(ws, 'backup', { ...readState(ws, 'backup'), lastRestore: { folder: out, at: new Date().toISOString(), files: record.files.length } });
  return { folder: out, files: record.files.length };
}
