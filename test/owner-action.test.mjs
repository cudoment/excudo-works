import test from 'node:test';
import assert from 'node:assert/strict';
import { splitChanges, renderEntry, render } from '../scripts/changelog.mjs';
import { ownerActions } from '../src/update.mjs';

const entry = { version: '0.2.0', date: '2026-12-01', changes: ['Add a report option.', 'Config!: Rename the schedule key to cadence.', 'Backup!: Run backup setup again.', 'Not an owner action!: lowercase words stay plain'] };

test('subjects with Area!: are split off as owner actions in order', () => {
  const { owner, other } = splitChanges(entry.changes);
  assert.deepEqual(owner, ['Config: Rename the schedule key to cadence.', 'Backup: Run backup setup again.']);
  assert.equal(other.length, 2);
});

test('the changelog lists the Owner action group before other changes', () => {
  const text = renderEntry(entry);
  assert.ok(text.indexOf('### Owner action') < text.indexOf('### Other changes'));
  assert.match(text, /### Owner action\n\n- Config: Rename the schedule key to cadence\.\n- Backup: Run backup setup again\.\n\n### Other changes\n\n- Add a report option\./);
});

test('an entry without markers keeps the plain list', () => {
  assert.equal(renderEntry({ version: '0.1.0', date: 'd', changes: ['One.', 'Two.'] }), '## 0.1.0 - d\n\nThis release includes the following changes.\n\n- One.\n- Two.\n');
});

test('update reads the Owner action items of the installed release', () => {
  const log = render([entry, { version: '0.1.0', date: 'd', changes: ['Old!: Not mine.'] }]);
  assert.deepEqual(ownerActions(log, '0.2.0'), [{ version: '0.2.0', items: ['Config: Rename the schedule key to cadence.', 'Backup: Run backup setup again.'] }]);
  assert.deepEqual(ownerActions(log, '0.1.0'), [{ version: '0.1.0', items: ['Old: Not mine.'] }]);
  assert.deepEqual(ownerActions(log, '9.9.9'), []);
  assert.deepEqual(ownerActions(render([{ version: '0.3.0', date: 'd', changes: ['Plain.'] }]), '0.3.0'), []);
});

test('versions newer than the previous one, up to the installed one, are collected', () => {
  const log = render([{ version: '0.4.0', date: 'd', changes: ['Late!: After the install.'] }, { version: '0.3.0', date: 'd', changes: ['Core!: Skipped version.'] }, { version: '0.2.0', date: 'd', changes: ['Mid!: Next version.'] }, { version: '0.1.0', date: 'd', changes: ['Old!: Already applied.'] }]);
  assert.deepEqual(ownerActions(log, '0.3.0', '0.1.0').map(x => x.version), ['0.3.0', '0.2.0']);
});

test('a plain update lists owner actions across a skipped version and records the kit version', async t => {
  const { workspace } = await import('./helpers.mjs'), { initWorkspace } = await import('../src/init.mjs'), { update } = await import('../src/update.mjs');
  const { readState, writeState } = await import('../src/state.mjs'), { packageInfo } = await import('../src/package-info.mjs');
  const current = packageInfo().version, ws = await workspace(t); await initWorkspace(ws.root);
  assert.equal(readState(ws, 'install').kitVersion, current);
  const notes = render([{ version: current, date: 'd', changes: ['Core!: Newest.'] }, { version: '0.0.5', date: 'd', changes: ['Skip!: Skipped release.'] }, { version: '0.0.2', date: 'd', changes: ['Mid!: Another skipped release.'] }, { version: '0.0.1', date: 'd', changes: ['Old!: Already seen.'] }]);
  writeState(ws, 'install', { ...readState(ws, 'install'), kitVersion: '0.0.1' });
  const offline = { code: 1, output: '' };
  const first = await update(ws, { registry: offline, notes });
  assert.deepEqual(first.ownerActions, [{ version: current, items: ['Core: Newest.'] }, { version: '0.0.5', items: ['Skip: Skipped release.'] }, { version: '0.0.2', items: ['Mid: Another skipped release.'] }]);
  assert.equal(readState(ws, 'install').kitVersion, current);
  const second = await update(ws, { registry: offline, notes });
  assert.deepEqual(second.ownerActions, []);
});

test('with no recorded version only the current release shows; rerunning init keeps an older record', async t => {
  const { workspace } = await import('./helpers.mjs'), { initWorkspace } = await import('../src/init.mjs'), { update } = await import('../src/update.mjs');
  const { readState, writeState } = await import('../src/state.mjs'), { packageInfo } = await import('../src/package-info.mjs');
  const current = packageInfo().version, ws = await workspace(t), offline = { code: 1, output: '' };
  const notes = render([{ version: current, date: 'd', changes: ['Core!: Newest.'] }, { version: '0.0.5', date: 'd', changes: ['Skip!: Skipped release.'] }, { version: '0.0.1', date: 'd', changes: ['Old!: Already seen.'] }]);
  await initWorkspace(ws.root);
  const { kitVersion, ...bare } = readState(ws, 'install'); writeState(ws, 'install', bare); assert.equal(readState(ws, 'install').kitVersion, undefined);
  assert.deepEqual((await update(ws, { registry: offline, notes })).ownerActions, [{ version: current, items: ['Core: Newest.'] }]);
  // A manual upgrade followed by init must not hide the skipped release.
  writeState(ws, 'install', { ...readState(ws, 'install'), kitVersion: '0.0.1' });
  await initWorkspace(ws.root);
  assert.equal(readState(ws, 'install').kitVersion, '0.0.1');
  assert.deepEqual((await update(ws, { registry: offline, notes })).ownerActions.map(x => x.version), [current, '0.0.5']);
  assert.equal(readState(ws, 'install').kitVersion, current);
});
