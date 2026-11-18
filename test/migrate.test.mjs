import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateRecord } from '../src/migrate.mjs';
for (const version of [0, 1, 2]) test(`record fixture v${version} migrates without losing history`, () => {
  const old = JSON.parse(readFileSync(new URL(`./fixtures/records-v${version}.json`, import.meta.url)));
  const next = migrateRecord(old);
  assert.equal(next.version, 2); assert.deepEqual(next.steps, old.steps); assert.deepEqual(next.history, old.history);
  assert.deepEqual(migrateRecord(next), next); assert.deepEqual(old, JSON.parse(readFileSync(new URL(`./fixtures/records-v${version}.json`, import.meta.url))));
});
test('future and malformed records fail closed', () => {
  assert.throws(() => migrateRecord({ version: 3 }), /newer/);
  assert.throws(() => migrateRecord({ version: 2, steps: [], history: [] }), /Invalid/);
});
import { migrations, migrateData, migrate } from '../src/migrate.mjs';
import { stateFile } from '../src/state.mjs';
import { workspace } from './helpers.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
for (const name of Object.keys(migrations)) test(`per-file ${name} fixture preserves data and migrates idempotently`, () => {
  const fixture = JSON.parse(readFileSync(new URL(`./fixtures/state/${name}.json`, import.meta.url)));
  const next = migrateData(name, fixture.before); assert.deepEqual(next, fixture.after); assert.deepEqual(migrateData(name, next), next);
  assert.throws(() => migrateData(name, { version: migrations[name].version + 1 }), /newer/);
});
test('all state files migrate at their configured cache and owner-file locations', async t => {
  const ws = await workspace(t); ws.cacheDir = `${ws.root}/.cache`;
  for (const name of Object.keys(migrations)) {
    const fixture = JSON.parse(readFileSync(new URL(`./fixtures/state/${name}.json`, import.meta.url)));
    const file = stateFile(ws, name); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(fixture.before));
  }
  migrate(ws);
  for (const name of Object.keys(migrations)) assert.equal(JSON.parse(readFileSync(stateFile(ws, name))).version, migrations[name].version);
});
