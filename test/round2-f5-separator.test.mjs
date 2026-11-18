import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspace } from './helpers.mjs';
import { writeReport } from '../src/report.mjs';
import { syncEdits, reportLine } from '../src/edits.mjs';
import { judgeComments } from '../src/judgment.mjs';
const activity = { commits: [], warnings: [] }, read = file => readFileSync(file, 'utf8');
async function setup(t, text) {
  const ws = await workspace(t), page = join(ws.graph, 'Plan.md'), report = join(ws.root, 'weekly.md');
  writeFileSync(page, text); await writeReport(ws, { activity }); return { ws, page, report };
}
test('F5: a task title containing the separator is untouched by unrelated report edits', async t => {
  const { ws, report } = await setup(t, '- DOING Compare A // B\n');
  writeFileSync(report, `${read(report)}\nOwner note without separator\n`);
  const pending = await syncEdits(ws); assert.deepEqual(pending.items.filter(item => item.kind === 'decision' || item.kind === 'conflict'), []);
});
test('F5: a title edit that adds the separator is applied as a task edit', async t => {
  const { ws, page, report } = await setup(t, '- DOING Compare A // B\n');
  writeFileSync(report, read(report).replace('Compare A // B', 'Compare A // C')); await syncEdits(ws);
  assert.equal(read(page), '- DOING Compare A // C\n');
});
test('F5: a question containing the separator accepts a trailing answer', async t => {
  const { ws, report } = await setup(t, '- DOING Plan\n');
  writeFileSync(report, `${read(report)}\n- Note // Which one?\n`); let pending = await syncEdits(ws); const comment = pending.items.find(item => item.kind === 'comment');
  await judgeComments(ws, { judge: async () => ({ code: 0, output: JSON.stringify([{ id: comment.id, action: 'ask', question: 'Rename A // B?' }]) }) });
  await writeReport(ws, { activity });
  const line = read(report).split('\n').find(text => text.includes(`[${comment.id}] Rename A // B?`)); assert.ok(line);
  writeFileSync(report, read(report).replace(line, () => `${line} // done`)); pending = await syncEdits(ws);
  assert.equal(pending.items.find(item => item.id === comment.id).status, 'closed');
  assert.equal(pending.items.filter(item => item.status === 'open').length, 0);
});
test('F5: reportLine prefers a known generated prefix over the first separator', () => {
  assert.deepEqual(reportLine('- [x] A // B? // done', new Set(['- [x] A // B?'])), { core: '- [x] A // B?', comment: 'done' });
  assert.deepEqual(reportLine('- Note // text'), { core: '- Note', comment: 'text' });
});
