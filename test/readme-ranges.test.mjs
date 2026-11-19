import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readmeRangeProblems, README_FILES } from '../scripts/release-check.mjs';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const readmes = Object.fromEntries(README_FILES.map(name => [name, readFileSync(name, 'utf8')]));
const stale = (name, from, to) => ({ ...readmes, [name]: readmes[name].replaceAll(from, to) });
const escape = name => name.replaceAll('.', '\\.');

test('the release check covers all four READMEs and the package ships them', () => {
  assert.deepEqual(README_FILES, ['README.md', 'README.ko.md', 'README.ja.md', 'README.zh-CN.md']);
  for (const name of README_FILES) assert.ok(manifest.files.includes(name), `${name} must be in package.json files`);
});

test('all four READMEs match the peer range and the kit major.minor', () => {
  assert.deepEqual(readmeRangeProblems(manifest, readmes), []);
});

test('a stale engine or kit range in any README is reported', () => {
  for (const name of README_FILES) {
    const engine = readmeRangeProblems(manifest, stale(name, 'excudo@^0.8.0', 'excudo@^0.6.0'));
    assert.equal(engine.length, 1, name);
    assert.match(engine[0], new RegExp(`${escape(name)} must use excudo@\\^0\\.8\\.0`));
    const kit = readmeRangeProblems(manifest, stale(name, 'excudo-works@^0.2.0', 'excudo-works@^0.1.9'));
    assert.equal(kit.length, 1, name);
    assert.match(kit[0], new RegExp(`${escape(name)} must use excudo-works@\\^0\\.2\\.0`));
  }
  assert.equal(readmeRangeProblems({ ...manifest, version: '0.3.0' }, readmes).length, README_FILES.length);
});

test('the requirement line at the top of each README is checked too', () => {
  for (const name of README_FILES) {
    assert.match(readmes[name], /Excudo `\^0\.8\.0`/, name);
    const problems = readmeRangeProblems(manifest, stale(name, 'Excudo `^0.8.0`', 'Excudo `^0.6.0`'));
    assert.equal(problems.length, 1, name);
    assert.match(problems[0], new RegExp(`${escape(name)} must use excudo@\\^0\\.8\\.0`));
  }
});

test('all four READMEs put git init and the engine report check in the agent line and the Start commands', () => {
  for (const name of README_FILES) {
    const text = readmes[name];
    assert.match(text, /`cd <absolute folder path> && npm install && git init && npx --no-install excudo start --report --json`/, name);
    assert.match(text, /`cd <absolute folder path> && npm install --save-dev excudo-works@\^0\.2\.0 && npx --no-install excudo-works init \. --locale \w+ && /, name);
    assert.doesNotMatch(text, /--report --json && npm install/, name);
    assert.match(text, /\ncd my-work\nnpm install\ngit init\nnpx --no-install excudo start --report --json\nnpm install --save-dev/, name);
  }
});

test('every README links the other three languages near the top', () => {
  for (const name of README_FILES) {
    const top = readmes[name].split('\n').slice(0, 5).join('\n');
    for (const other of README_FILES.filter(file => file !== name)) assert.ok(top.includes(`(${other})`), `${name} must link ${other}`);
    assert.ok(!top.includes(`(${name})`), `${name} must not link itself`);
  }
});

test('the language rule is in the agent install rules of every README', () => {
  assert.match(readmes['README.md'], /Use `ko` only if the owner reads Korean; otherwise use `en`/);
  assert.match(readmes['README.md'], /Keep talking to the owner in the owner's own language/);
  assert.match(readmes['README.ko.md'], /사용자가 한국어를 읽을 때만 `ko`/);
  for (const name of ['README.ja.md', 'README.zh-CN.md']) {
    const text = readmes[name];
    assert.match(text, new RegExp(`following the section "[^"]+" of its ${escape(name)}`), name);
    assert.match(text, /init my-work --locale en/, name);
    assert.doesNotMatch(text, /--locale ko/, name);
  }
});

test('no README uses a middle dot, corner brackets, circled numbers or an em dash', () => {
  for (const name of README_FILES) assert.doesNotMatch(readmes[name], /[·・ㆍ•‧∙⋅「」『』①-⑳—]/u, name);
});
