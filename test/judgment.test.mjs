import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace } from './helpers.mjs';
import { writeReport } from '../src/report.mjs';
import { syncEdits } from '../src/edits.mjs';
import { judgeComments } from '../src/judgment.mjs';
const activity = { commits: [], warnings: [] };
async function comment(t) {
  const ws = await workspace(t); writeFileSync(join(ws.graph, 'Plan.md'), '- DOING Draft plan\n');
  await writeReport(ws, { activity }); const file = join(ws.root, 'weekly.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace('## To check', '## To check\n\n- Question // Rename the draft plan to Outline plan'));
  const pending = await syncEdits(ws), report = JSON.parse(readFileSync(join(ws.root, '.excudo/works/report.json')));
  return { ws, id: pending.items[0].id, task: report.tasks[0].id };
}
test('read-only comment judgment applies only validated policy-permitted edits', async t => {
  const { ws, id, task } = await comment(t);
  const result = await judgeComments(ws, { judge: async prompt => { assert.match(prompt, /Do not modify files/); return { code: 0, output: JSON.stringify([{ id, action: 'task-edit', task, title: 'Outline plan', status: 'DOING' }]) }; } });
  assert.equal(result.code, 0); assert.equal(readFileSync(join(ws.graph, 'Plan.md'), 'utf8'), '- DOING Outline plan\n');
  assert.equal(JSON.parse(readFileSync(join(ws.root, '.excudo/works/edits.json'))).items.filter(x => x.status !== 'closed').length, 0);
});
test('completion and concurrent source edits remain decisions even if the worker proposes them', async t => {
  const { ws, id, task } = await comment(t);
  await judgeComments(ws, { judge: async () => ({ code: 0, output: JSON.stringify([{ id, action: 'task-edit', task, title: 'Outline plan', status: 'DONE' }]) }) });
  assert.equal(readFileSync(join(ws.graph, 'Plan.md'), 'utf8'), '- DOING Draft plan\n');
  const pending = JSON.parse(readFileSync(join(ws.root, '.excudo/works/edits.json'))); assert.match(pending.items[0].question, /approval/);
});
test('invalid and incomplete judgment responses preserve every comment', async t => {
  const { ws } = await comment(t);
  await assert.rejects(judgeComments(ws, { judge: async () => ({ code: 0, output: '[]' }) }), /incomplete/);
  assert.equal(JSON.parse(readFileSync(join(ws.root, '.excudo/works/edits.json'))).items.length, 1);
  await assert.rejects(judgeComments(ws, { judge: async () => ({ code: 0, output: 'plain text' }) }), /valid JSON/);
  assert.equal(readFileSync(join(ws.graph, 'Plan.md'), 'utf8'), '- DOING Draft plan\n');
});
