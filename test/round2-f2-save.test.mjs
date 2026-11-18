import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { workspace } from './helpers.mjs';
import { writeReport, writeBacklog } from '../src/report.mjs';
import { syncEdits } from '../src/edits.mjs';
const activity = { commits: [], warnings: [] }, read = file => readFileSync(file, 'utf8');
const git = (root, args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
async function failing(t) {
  const ws = await workspace(t), page = join(ws.graph, 'Plan.md'), report = join(ws.root, 'weekly.md');
  writeFileSync(page, '- DOING Draft plan\n'); await writeReport(ws, { activity });
  writeFileSync(join(ws.root, '.gitignore'), '.excudo/\n.fake-engine-calls\nfake-engine.json\n'); git(ws.root, ['init']); git(ws.root, ['add', '.']);
  git(ws.root, ['-c', 'user.name=Fixture Owner', '-c', 'user.email=fixture.invalid', 'commit', '-m', 'Set up fixture']);
  writeFileSync(report, read(report).replace('Draft plan', 'Outline plan')); writeFileSync(join(ws.root, 'fake-engine.json'), '{"saveFail":true}');
  return { ws, page, report };
}
test('F2: a failed engine save keeps the written file pending and is retried by the next edits step', async t => {
  const { ws, page, report } = await failing(t);
  await assert.rejects(syncEdits(ws), /Engine save failed/);
  assert.equal(read(page), '- DOING Outline plan\n');
  const file = join(ws.root, '.excudo/works/edits.json'); assert.deepEqual(JSON.parse(read(file)).dirtyFiles, ['notes/Plan.md']);
  await writeReport(ws, { activity }); assert.match(read(report), /notes\/Plan\.md/); assert.match(read(writeBacklog(ws, [])), /notes\/Plan\.md/);
  writeFileSync(join(ws.root, 'fake-engine.json'), '{}');
  await syncEdits(ws);
  assert.deepEqual(JSON.parse(read(file)).dirtyFiles, []); assert.equal(git(ws.root, ['show', '--format=', '--name-only', 'HEAD']).stdout.trim(), 'notes/Plan.md');
});
