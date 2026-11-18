import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace } from './helpers.mjs';
import { writeReport } from '../src/report.mjs';
import { fingerprint } from '../src/edits.mjs';
const activity = { commits: [], warnings: [] };
const backups = ws => readdirSync(join(ws.root, '.excudo/works')).filter(name => /^report-before-.*\.md$/.test(name));
test('F10: report backups keep only the newest few and always the latest', async t => {
  const ws = await workspace(t, { report: { keepBackups: 3 } }), file = join(ws.root, 'weekly.md');
  await writeReport(ws, { activity }); let last;
  for (let i = 0; i < 8; i++) { writeFileSync(file, `${readFileSync(file, 'utf8')}\nOwner note ${i}\n`); last = fingerprint(readFileSync(file, 'utf8')); await writeReport(ws, { activity }); }
  assert.equal(backups(ws).length, 3); assert.ok(backups(ws).includes(`report-before-${last}.md`));
});
test('F10: the default keeps five backups', async t => {
  const ws = await workspace(t), file = join(ws.root, 'weekly.md');
  await writeReport(ws, { activity });
  for (let i = 0; i < 9; i++) { writeFileSync(file, `${readFileSync(file, 'utf8')}\nOwner note ${i}\n`); await writeReport(ws, { activity }); }
  assert.equal(backups(ws).length, 5);
});
