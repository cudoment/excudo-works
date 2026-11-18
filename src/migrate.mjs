import { existsSync, readFileSync } from 'node:fs';
import { json } from './files.mjs';
import { migrations, migrateData, stateFile, readState } from './state.mjs';
import { withWorkspaceLock } from './lock.mjs';
export { migrations, migrateData } from './state.mjs';
export const RECORD_VERSION = migrations.records.version;
export const migrateRecord = old => migrateData('records', old);
export function migrate(ws) {
  return withWorkspaceLock(ws, () => {
    for (const name of Object.keys(migrations)) {
      const file = stateFile(ws, name);
      if (!existsSync(file) && name !== 'records') continue;
      const original = existsSync(file) ? readFileSync(file, 'utf8') : null;
      const old = original === null ? {} : JSON.parse(original), next = migrateData(name, old);
      if (JSON.stringify(old) !== JSON.stringify(next)) {
        if ((existsSync(file) ? readFileSync(file, 'utf8') : null) !== original) throw new Error(`${name} changed during migration; retry.`);
        json(file, next);
      }
    }
    return readState(ws, 'records');
  });
}
