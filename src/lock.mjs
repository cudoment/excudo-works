import { AsyncLocalStorage } from 'node:async_hooks';
import { hostname } from 'node:os';
import { mkdirSync, writeFileSync, realpathSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { json, readJSON } from './files.mjs';
import { statePaths } from './state.mjs';
const context = new AsyncLocalStorage();
const identity = ws => realpathSync(statePaths(ws).root);
const running = pid => { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; } };
export function acquireLock(ws) {
  const folder = statePaths(ws).lock, token = randomUUID();
  mkdirSync(statePaths(ws).works, { recursive: true });
  for (;;) {
    try { mkdirSync(folder); break; } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const file = join(folder, 'owner.json'), owner = readJSON(file, {});
      if (owner.host !== hostname() || !owner.pid || running(owner.pid)) throw new Error('A run lock exists; its live or unknown owner must finish before another state writer starts.');
      try { writeFileSync(join(folder, 'reclaim'), token, { flag: 'wx' }); } catch { throw new Error('A run lock is being recovered; retry.'); }
      const latest = readJSON(file, {});
      if (latest.token !== owner.token || latest.pid !== owner.pid || running(latest.pid)) { rmSync(join(folder, 'reclaim'), { force: true }); throw new Error('The run lock owner changed; retry.'); }
      const aside = `${folder}.${token}.old`; renameSync(folder, aside); rmSync(aside, { recursive: true, force: true });
    }
  }
  try { json(join(folder, 'owner.json'), { pid: process.pid, host: hostname(), token, at: new Date().toISOString() }); }
  catch (error) { rmSync(folder, { recursive: true, force: true }); throw error; }
  const release = () => { if (readJSON(join(folder, 'owner.json'), {}).token === token) rmSync(folder, { recursive: true, force: true }); };
  release.token = token; return release;
}
export function lockToken(ws) { return context.getStore()?.get(identity(ws)) ?? process.env.EXCUDO_WORKS_LOCK_TOKEN; }
function delegated(ws) {
  if (!process.env.EXCUDO_WORKS_LOCK_ROOT || !process.env.EXCUDO_WORKS_LOCK_TOKEN) return false;
  try { if (realpathSync(process.env.EXCUDO_WORKS_LOCK_ROOT) !== identity(ws)) return false; } catch { return false; }
  const owner = readJSON(join(statePaths(ws).lock, 'owner.json'), {});
  return owner.token === process.env.EXCUDO_WORKS_LOCK_TOKEN && owner.host === hostname() && running(owner.pid);
}
export function withWorkspaceLock(ws, fn) {
  const root = identity(ws);
  if (context.getStore()?.has(root) || delegated(ws)) return fn();
  const release = acquireLock(ws), next = new Map(context.getStore() ?? []); next.set(root, release.token);
  try {
    const result = context.run(next, fn);
    if (result && typeof result.then === 'function') return result.finally(release);
    release(); return result;
  } catch (error) { release(); throw error; }
}
