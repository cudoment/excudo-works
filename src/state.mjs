import { resolve, join } from 'node:path';
import { readJSON, json, inside } from './files.mjs';
export function statePaths(ws) {
  const root = typeof ws === 'string' ? resolve(ws) : ws.root;
  const cache = typeof ws === 'string' ? join(root, '.excudo') : resolve(root, ws.cacheDir ?? ws.engine?.cache ?? '.excudo');
  return { root, cache, works: join(cache, 'works'), logs: join(cache, 'logs'), reports: join(cache, 'reports'), lock: join(cache, 'works/run.lock') };
}
const statuses = values => (values ?? []).map(item => ({ ...item, status: item.status ?? 'open' }));
export const migrations = {
  records: { version: 2, initial: () => ({ steps: {}, history: [] }), steps: [value => ({ ...value, version: 1 }), value => ({ ...value, version: 2, manual: value.manual ?? null })] },
  edits: { version: 2, initial: () => ({ items: [], improvements: [], applied: [] }), steps: [value => ({ ...value, version: 1 }), value => ({ ...value, version: 2, revision: value.revision ?? 0, items: statuses(value.items), improvements: statuses(value.improvements), applied: value.applied ?? [], dirtyFiles: value.dirtyFiles ?? [] })] },
  report: { version: 2, initial: () => ({ tasks: [], text: '', generation: 0 }), steps: [value => ({ ...value, version: 1 }), value => ({ ...value, version: 2, tasks: (value.tasks ?? []).map(task => ({ ...task, source: task.source?.replace(/\r$/, '') })) })] },
  install: { version: 2, initial: () => ({ blocks: {}, links: [] }), steps: [value => ({ ...value, version: 1 }), value => ({ ...value, version: 2, links: value.links ?? [], blocks: value.blocks ?? {} })] },
  review: { version: 1, initial: () => ({}), steps: [value => ({ ...value, version: 1 })] },
  backup: { version: 1, initial: () => ({}), steps: [value => ({ ...value, version: 1 })] },
  policy: { version: 1, initial: () => ({}), steps: [value => ({ ...value, version: 1 })] },
  invariants: { version: 1, initial: () => ({}), steps: [value => ({ ...value, version: 1 })] },
};
export function stateFile(ws, name) {
  if (name === 'policy' || name === 'invariants') return inside(statePaths(ws).root, typeof ws === 'string' ? `${name}.json` : ws.config[name]);
  return join(statePaths(ws).works, `${name}.json`);
}
export function migrateData(name, old = {}) {
  const spec = migrations[name];
  if (!spec || !old || typeof old !== 'object' || Array.isArray(old)) throw new Error(`Invalid ${name} state.`);
  let value = { ...spec.initial(), ...structuredClone(old) };
  if (!Number.isInteger(value.version ?? 0) || (value.version ?? 0) > spec.version || (value.version ?? 0) < 0) throw new Error(`${name} records are newer than this kit or invalid; update before running.`);
  while ((value.version ?? 0) < spec.version) value = spec.steps[value.version ?? 0](value);
  if (name === 'records' && (!value.steps || typeof value.steps !== 'object' || Array.isArray(value.steps) || !Array.isArray(value.history))) throw new Error('Invalid run records.');
  if (name === 'edits' && ['items', 'improvements', 'applied', 'dirtyFiles'].some(key => !Array.isArray(value[key]))) throw new Error('Invalid edits state.');
  return value;
}
export const readState = (ws, name) => migrateData(name, readJSON(stateFile(ws, name), {}));
export function writeState(ws, name, value) {
  const next = migrateData(name, value);
  if (name === 'edits') next.revision = (next.revision ?? 0) + 1;
  json(stateFile(ws, name), next); return next;
}
