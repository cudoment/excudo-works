import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { statePaths } from './state.mjs';
import { engineRun, sync } from './process.mjs';
export async function engineAPI(ws) {
  for (const base of [join(ws.root, 'package.json'), import.meta.url]) {
    try {
      const api = await import(pathToFileURL(createRequire(base).resolve('excudo')).href);
      const loaded = await api.loadWorkspace({ root: ws.root });
      return { api, ws: { ...loaded, root: ws.root, graphDir: ws.graph, cacheDir: statePaths(ws).cache } };
    } catch (error) { if (base === import.meta.url && !['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND'].includes(error.code)) throw error; }
  }
  return null;
}
// The engine's own rule for lines that look private; null when the installed engine does not export it.
export async function enginePrivateLine(ws) {
  for (const base of [join(ws.root, 'package.json'), import.meta.url]) {
    try { const api = await import(pathToFileURL(createRequire(base).resolve('excudo')).href); if (typeof api.privateLine === 'function') return api.privateLine; } catch {}
  }
  return null;
}
export async function idleAllowed(ws, { manual = process.env.EXCUDO_WORKS_MANUAL !== 'false', signal } = {}) {
  if (manual || !ws.config.idle) return true;
  return (await engineRun(ws.root, ['idle', '--json'], { signal, timeoutMs: 15000 })).code === 0;
}
export async function underGraph(ws, fn, options = {}) {
  if (!await idleAllowed(ws, options)) return { deferred: true, files: [] };
  const engine = await engineAPI(ws);
  const locked = engine?.api.withGraphAsync ?? engine?.api.withGraph;
  if (!locked) return fn();
  return locked(engine.ws, () => {
    if ((options.manual === false || options.manual === undefined && process.env.EXCUDO_WORKS_MANUAL === 'false') && ws.config.idle && engine.api.idle) {
      const idle = engine.api.idle(engine.ws);
      if (idle.paused?.length || idle.recent?.length) return { deferred: true, files: [] };
    }
    return fn();
  });
}
export async function saveWritten(ws, paths, { hashes = new Map(), signal } = {}) {
  const files = [...new Set(paths)];
  if (!files.length || sync('git', ['rev-parse', '--is-inside-work-tree'], ws.root).status !== 0) return;
  for (const file of files) if (hashes.has(file) && readFileSync(resolve(ws.root, file), 'utf8') !== hashes.get(file)) throw new Error('A memo source changed before saving; edits preserved for review.');
  const args = ['save', ...files.flatMap(file => ['--only', file]), 'Apply reviewed report edits'];
  const result = await engineRun(ws.root, args, { signal, timeoutMs: ws.config.timeoutMs });
  if (result.code !== 0) throw new Error('Engine save failed; kit-written memo files remain pending for review.');
}
export async function engineFolders(ws) {
  const engine = process.env.EXCUDO_WORKS_ENGINE_SCRIPT ? null : await engineAPI(ws);
  if (engine?.api.pathLines) return [...new Set([ws.root, ...engine.api.pathLines(engine.ws).map(item => item.path)])];
  const result = await engineRun(ws.root, ['workspaces', '--dry-run', '--json']);
  try { return [...new Set([ws.root, ...JSON.parse(result.output).names.map(item => item.path)])]; } catch { return [ws.root]; }
}
