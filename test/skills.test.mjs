import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { skillNames, criteria, evaluate } from '../src/skill-check.mjs';
import { registryProblems, publicInventory } from '../scripts/release-check.mjs';
test('every skill has passing and failing facts and scores 100 with the engine linter', () => {
  const require = createRequire(import.meta.url), engine = dirname(dirname(require.resolve('excudo')));
  for (const name of skillNames) {
    const folder = resolve('skills', name), cases = JSON.parse(readFileSync(join(folder, 'scripts/check.cases.json')));
    assert.ok(cases.some(x => x.expect === 'fail')); assert.ok(cases.some(x => x.expect === 'pass'));
    for (const item of cases) assert.equal(evaluate(name, item.facts).every(x => x.ok) ? 'pass' : 'fail', item.expect);
    const result = spawnSync(process.execPath, [join(engine, 'bin/excudo.mjs'), 'skills', 'lint', folder, '--json'], { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const [lint] = JSON.parse(result.stdout); assert.equal(lint.ok, true, name); assert.equal(lint.score, 100, name);
    assert.equal(criteria[name].length >= 3, true);
  }
});
test('release dependency check rejects file and remote git dependencies, links and non-registry lock entries', () => {
  assert.equal(registryProblems({ peerDependencies: { excudo: '^0.7.0' } }).length, 0);
  assert.ok(registryProblems({ devDependencies: { excudo: 'file:../engine' } }).length);
  assert.ok(registryProblems({ dependencies: { helper: 'https://example.org/helper.tgz' } }).length);
  assert.ok(registryProblems({}, { packages: { dependency: { link: true } } }).length);
  assert.ok(registryProblems({}, { packages: { dependency: { resolved: 'file:../helper' } } }).length);
});

test('package inventory accepts npm array and named output and rejects private files', () => {
  assert.equal(publicInventory(JSON.stringify([{ files: [{ path: 'src/index.mjs' }] }])), true);
  assert.equal(publicInventory(JSON.stringify({ 'excudo-works': { files: [{ path: 'src/index.mjs' }] } })), true);
  assert.equal(publicInventory(JSON.stringify([{ files: [{ path: 'private/denylist.txt' }] }])), false);
});
