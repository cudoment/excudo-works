import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { workspace } from './helpers.mjs';
import { collectTasks, writeReport } from '../src/report.mjs';
import { syncEdits } from '../src/edits.mjs';
const activity = { commits: [{ text: 'abc123 A useful change', folder: '/work/project' }], warnings: [] };
const now = new Date('2030-01-07T18:00:00Z');
test('weekly tasks respect completion period, fences and owner Home', async t => {
  const ws = await workspace(t);
  writeFileSync(join(ws.graph, 'Project.md'), '# Project\n- DONE Old\n  CLOSED:: 2020-01-01\n- DONE Recent\n  CLOSED:: 2030-01-06\n- DOING Active\n- WAITING Review\n```\n- DOING Example only\n```\n');
  mkdirSync(join(ws.graph, 'views')); writeFileSync(join(ws.graph, 'views/Home.mdx'), '- DOING Personal task');
  assert.deepEqual(collectTasks(ws, now).map(x => x.title), ['Recent', 'Active', 'Review']);
  await writeReport(ws, { now, activity });
  const file = join(ws.root, 'weekly.md'); writeFileSync(file, `Owner introduction\n${readFileSync(file, 'utf8')}\nOwner notes\n`);
  await writeReport(ws, { now, activity }); const text = readFileSync(file, 'utf8');
  assert.match(text, /^Owner introduction/); assert.match(text, /Owner notes\n$/); assert.match(text, /abc123/);
});
test('title edits sync once with backups, while completion and conflicts remain decisions', async t => {
  const ws = await workspace(t); const page = join(ws.graph, 'Project.md'), report = join(ws.root, 'weekly.md');
  writeFileSync(page, '- DOING Write proposal\n- WAITING Review draft\n');
  await writeReport(ws, { now, activity });
  writeFileSync(report, readFileSync(report, 'utf8').replace('Write proposal', 'Write short proposal').replace('WAITING Review draft', 'DONE Review draft'));
  const pending = await syncEdits(ws);
  assert.match(readFileSync(page, 'utf8'), /Write short proposal/); assert.match(readFileSync(page, 'utf8'), /WAITING Review draft/);
  assert.equal(pending.items.filter(x => x.status !== 'closed').length, 1); assert.equal(pending.applied.length, 1);
  assert.equal((await syncEdits(ws)).applied.length, 1);
  assert.ok(existsSync(join(ws.root, '.excudo/works/report-edited.md')));
  await writeReport(ws, { now, activity }); assert.match(readFileSync(report, 'utf8'), /Apply this title or status edit/);
  writeFileSync(report, readFileSync(report, 'utf8').replace('Write short proposal', 'Write final proposal'));
  writeFileSync(page, '- DOING Concurrent edit\n- WAITING Review draft\n');
  assert.ok((await syncEdits(ws)).items.some(x => x.kind === 'conflict'));
  assert.match(readFileSync(page, 'utf8'), /Concurrent edit/);
});
test('comments become decisions or code improvement requests, without repeated intake', async t => {
  const ws = await workspace(t); await writeReport(ws, { now, activity }); const file = join(ws.root, 'weekly.md');
  writeFileSync(file, readFileSync(file, 'utf8') + '\n- Question // improve: Shorten the alert\n- Another // Ask me tomorrow\n');
  const pending = await syncEdits(ws); assert.equal(pending.improvements.length, 1); assert.equal(pending.items.filter(x => x.status !== 'closed').length, 1);
  assert.equal((await syncEdits(ws)).improvements.length, 1);
  await writeReport(ws, { now, activity }); assert.match(readFileSync(file, 'utf8'), /Shorten the alert/);
});
test('missing report markers preserve content instead of overwriting it', async t => {
  const ws = await workspace(t); const file = join(ws.root, 'weekly.md'); writeFileSync(file, 'Owner report\n');
  await assert.rejects(writeReport(ws, { now, activity }), /markers/); assert.equal(readFileSync(file, 'utf8'), 'Owner report\n');
});
test('free-form generated edits become visible decisions and keep their complete snapshot', async t => {
  const ws = await workspace(t); await writeReport(ws, { now, activity }); const file = join(ws.root, 'weekly.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace('## To check', '## To check\n\n- A custom report statement'));
  const pending = await syncEdits(ws); assert.ok(pending.items.some(x => x.kind === 'report-edit' && x.text.includes('custom report statement')));
  await writeReport(ws, { now, activity }); assert.match(readFileSync(file, 'utf8'), /Review added generated report content/);
});
test('an explicit answer on a pending completion question applies that task edit once', async t => {
  const ws = await workspace(t), page = join(ws.graph, 'Plan.md'), file = join(ws.root, 'weekly.md');
  writeFileSync(page, '- WAITING Review draft\n'); await writeReport(ws, { now, activity });
  writeFileSync(file, readFileSync(file, 'utf8').replace('WAITING Review draft', 'DONE Review draft'));
  await syncEdits(ws); await writeReport(ws, { now, activity });
  const question = readFileSync(file, 'utf8').split('\n').find(line => line.includes('Apply this title or status edit'));
  writeFileSync(file, readFileSync(file, 'utf8').replace(question, `${question} // apply`));
  const pending = await syncEdits(ws); assert.equal(readFileSync(page, 'utf8'), '- DONE Review draft\n'); assert.equal(pending.items.filter(x => x.status !== 'closed').length, 0);
  assert.equal((await syncEdits(ws)).items.filter(x => x.status !== 'closed').length, 0);
});
test('completion dates include today before noon and do not borrow the next task date', async t => {
  const ws = await workspace(t, { timezone: 'Asia/Tokyo' });
  writeFileSync(join(ws.graph, 'Dates.md'), '- DONE Today\n  CLOSED:: 2030-01-07\n- DONE Future\n  CLOSED:: 2030-01-08\n- DONE Old\n  CLOSED:: 2020-01-01\n');
  assert.deepEqual(collectTasks(ws, new Date('2030-01-07T00:00:00Z')).map(x => x.title), ['Today']);
});
