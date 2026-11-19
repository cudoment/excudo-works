import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { publicExport, normalizeRepoUrl } from '../scripts/public-export.mjs';

const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' };
const git = (cwd, ...args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8', env }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
const pkg = version => JSON.stringify({ version, repository: { type: 'git', url: 'git+https://github.com/example/kit.git' } });
function repo(t, files, origin = 'https://github.com/example/kit') {
  const root = mkdtempSync(join(tmpdir(), 'works-export-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q'); if (origin) git(root, 'remote', 'add', 'origin', origin); put(root, files); git(root, 'add', '-A'); git(root, 'commit', '-qm', 'Initial');
  return root;
}
// A source repository whose HEAD carries the release tag, as the export requires.
function released(t, files) {
  const root = repo(t, files), version = JSON.parse(files['package.json']).version;
  git(root, 'tag', `v${version}`); return root;
}
function put(root, files) { for (const [name, text] of Object.entries(files)) { mkdirSync(join(root, name, '..'), { recursive: true }); writeFileSync(join(root, name), text); } }

test('export replaces tracked files, keeps .git and prints the next commands', t => {
  const source = released(t, { 'package.json': pkg('0.2.0'), 'src/a.mjs': 'new', '.gitignore': 'private/\n' });
  put(source, { 'private/note.txt': 'secret', 'private/denylist.txt': 'unrelated-phrase\n' });
  const clone = repo(t, { 'package.json': pkg('0.1.0'), 'old/gone.txt': 'old', 'src/a.mjs': 'old' });
  const result = publicExport(source, clone);
  assert.equal(result.ok, true); assert.equal(result.version, '0.2.0');
  assert.equal(readFileSync(join(clone, 'src/a.mjs'), 'utf8'), 'new');
  assert.equal(existsSync(join(clone, 'old')), false);
  assert.equal(existsSync(join(clone, 'private')), false);
  assert.equal(existsSync(join(clone, '.git')), true);
  assert.match(result.commands[1], /commit -m "Excudo Works 0\.2\.0"/);
  assert.ok(result.commands.some(c => c.endsWith('push')));
});

test('export refuses a dirty source, a dirty clone and a folder without .git', t => {
  const source = released(t, { 'package.json': pkg('0.2.0') }), clone = repo(t, { 'package.json': pkg('0.1.0') });
  put(clone, { 'edited.txt': 'x' });
  assert.throws(() => publicExport(source, clone), /uncommitted changes/);
  rmSync(join(clone, 'edited.txt'));
  put(source, { 'dirty.txt': 'x' });
  assert.throws(() => publicExport(source, clone), /Commit or discard/);
  assert.throws(() => publicExport(source, tmpdir()), /not a git clone/);
  assert.throws(() => publicExport(source, source), /different folder/);
});

test('export fails the denylist scan without echoing the phrase', t => {
  const source = released(t, { 'package.json': pkg('0.2.0'), 'doc.md': 'mentions restricted-phrase here', '.gitignore': 'private/\n' });
  put(source, { 'private/denylist.txt': 'restricted-phrase\n' });
  const clone = repo(t, { 'package.json': pkg('0.1.0') });
  const result = publicExport(source, clone);
  assert.equal(result.ok, false); assert.equal(result.stage, 'source'); assert.deepEqual(result.commands, []);
  assert.equal(readFileSync(join(clone, 'package.json'), 'utf8'), pkg('0.1.0'));
  assert.deepEqual(result.found.map(x => x.file), ['doc.md']);
  assert.ok(!JSON.stringify(result).includes('restricted-phrase'));
});

test('export fails without a private list and accepts --list', t => {
  const source = released(t, { 'package.json': pkg('0.2.0') }), clone = repo(t, { 'package.json': pkg('0.1.0') });
  assert.throws(() => publicExport(source, clone), /denylist is missing/);
  assert.throws(() => publicExport(source, clone, join(source, 'nope.txt')), /denylist is missing/);
  const list = join(tmpdir(), `works-list-${process.pid}.txt`); writeFileSync(list, 'unrelated-phrase\n'); t.after(() => rmSync(list, { force: true }));
  assert.equal(publicExport(source, clone, list).ok, true);
});

test('a failing post-write scan restores the clone', t => {
  const source = released(t, { 'package.json': pkg('0.2.0'), 'src/a.mjs': 'new', '.gitignore': 'private/\n' });
  put(source, { 'private/denylist.txt': 'unrelated-phrase\n' });
  const clone = repo(t, { 'package.json': pkg('0.1.0'), 'old/gone.txt': 'old' });
  const calls = [], scanner = root => { calls.push(root); return calls.length === 1 ? { ok: true, found: [] } : { ok: false, found: [{ file: 'src/a.mjs', kind: 'path' }] }; };
  const result = publicExport(source, clone, undefined, scanner);
  assert.equal(result.ok, false); assert.equal(result.stage, 'clone'); assert.equal(result.restored, true);
  assert.equal(readFileSync(join(clone, 'old/gone.txt'), 'utf8'), 'old');
  assert.equal(existsSync(join(clone, 'src')), false);
  assert.equal(git(clone, 'status', '--porcelain').trim(), '');
});

test('the release check says skipped, not passed, when the private list is missing', async () => {
  const { denylistDetail } = await import('../scripts/release-check.mjs');
  assert.match(denylistDetail({ ok: true, skipped: true, found: [] }), /skipped/);
  assert.doesNotMatch(denylistDetail({ ok: true, skipped: true, found: [] }), /passed/);
  assert.match(denylistDetail({ ok: true, skipped: false, found: [] }), /passed/);
});

test('export refuses a clone whose origin is another repository, before changing it', t => {
  const source = released(t, { 'package.json': pkg('0.2.0'), '.gitignore': 'private/\n' }); put(source, { 'private/denylist.txt': 'unrelated-phrase\n' });
  const other = repo(t, { 'package.json': pkg('0.1.0'), 'old.txt': 'old' }, 'https://github.com/example/other.git');
  assert.throws(() => publicExport(source, other), /origin does not match/);
  assert.equal(existsSync(join(other, 'old.txt')), true);
  const none = repo(t, { 'package.json': pkg('0.1.0') }, null);
  assert.throws(() => publicExport(source, none), /no origin remote/);
});

test('repository addresses compare after normalizing git+https, .git and ssh forms', () => {
  const forms = ['git+https://github.com/Example/Kit.git', 'https://github.com/example/kit', 'git@github.com:example/kit.git', 'ssh://git@github.com/example/kit.git', 'https://user@github.com/example/kit/'];
  for (const form of forms) assert.equal(normalizeRepoUrl(form), 'https://github.com/example/kit');
});

test('an exception after the clone changed restores it', t => {
  const source = released(t, { 'package.json': pkg('0.2.0'), 'src/a.mjs': 'new', '.gitignore': 'private/\n' }); put(source, { 'private/denylist.txt': 'unrelated-phrase\n' });
  const clone = repo(t, { 'package.json': pkg('0.1.0'), 'old/gone.txt': 'old' });
  let calls = 0;
  assert.throws(() => publicExport(source, clone, undefined, () => { if (++calls === 2) throw new Error('scanner crashed'); return { ok: true, found: [] }; }), /scanner crashed.*The clone was restored/);
  assert.equal(readFileSync(join(clone, 'old/gone.txt'), 'utf8'), 'old');
  assert.equal(existsSync(join(clone, 'src')), false);
  assert.equal(git(clone, 'status', '--porcelain').trim(), '');
});

test('export requires the tag v<version> on the exported commit', t => {
  const source = repo(t, { 'package.json': pkg('0.2.0'), '.gitignore': 'private/\n' }); put(source, { 'private/denylist.txt': 'unrelated-phrase\n' });
  const clone = repo(t, { 'package.json': pkg('0.1.0'), 'old.txt': 'old' });
  assert.throws(() => publicExport(source, clone), /tag v0\.2\.0 must point at HEAD/);
  assert.equal(existsSync(join(clone, 'old.txt')), true);
  git(source, 'tag', 'v0.2.0'); put(source, { 'later.txt': 'x' }); git(source, 'add', '-A'); git(source, 'commit', '-qm', 'Later');
  assert.throws(() => publicExport(source, clone), /tag v0\.2\.0 must point at HEAD/);
});

test('--ref exports the tagged commit even when HEAD has moved on', t => {
  const source = released(t, { 'package.json': pkg('0.2.0'), 'src/a.mjs': 'tagged', '.gitignore': 'private/\n' }); put(source, { 'private/denylist.txt': 'unrelated-phrase\n' });
  put(source, { 'src/a.mjs': 'newer' }); git(source, 'add', '-A'); git(source, 'commit', '-qm', 'Later');
  const clone = repo(t, { 'package.json': pkg('0.1.0') });
  assert.throws(() => publicExport(source, clone), /must point at HEAD/);
  const result = publicExport(source, clone, undefined, undefined, 'v0.2.0');
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(readFileSync(join(clone, 'src/a.mjs'), 'utf8'), 'tagged');
  assert.throws(() => publicExport(source, clone, undefined, undefined, 'no-such-ref'), /not a commit/);
});

test('export refuses before changing a clone that has an ignored file at an exported path', t => {
  const source = released(t, { 'package.json': pkg('0.2.0'), 'local.txt': 'public', 'dir/x.txt': 'x', '.gitignore': 'private/\n' }); put(source, { 'private/denylist.txt': 'unrelated-phrase\n' });
  const clone = repo(t, { 'package.json': pkg('0.1.0'), 'old.txt': 'old', '.gitignore': 'local.txt\ndir\n*.log\n' });
  put(clone, { 'local.txt': 'mine' });
  assert.throws(() => publicExport(source, clone), /overwrite files in the clone that git does not track: "local\.txt"/);
  assert.equal(readFileSync(join(clone, 'local.txt'), 'utf8'), 'mine');
  assert.equal(readFileSync(join(clone, 'old.txt'), 'utf8'), 'old');
  rmSync(join(clone, 'local.txt')); put(clone, { 'dir': 'a file where the archive has a folder' });
  assert.throws(() => publicExport(source, clone), /not track: "dir"/);
  rmSync(join(clone, 'dir')); put(clone, { 'keep.log': 'keep' });
  assert.equal(publicExport(source, clone).ok, true);
});

test('the privacy scan covers the files of the exported commit, including ones the clone ignores', t => {
  const source = released(t, { 'package.json': pkg('0.2.0'), 'build/out.txt': 'has restricted-phrase', '.gitignore': 'private/\n' }); put(source, { 'private/denylist.txt': 'restricted-phrase\n' });
  const clone = repo(t, { 'package.json': pkg('0.1.0'), '.gitignore': 'build/\n' });
  const result = publicExport(source, clone);
  assert.equal(result.ok, false); assert.equal(result.stage, 'source');
  assert.deepEqual(result.found.map(x => x.file), ['build/out.txt']);
  assert.equal(readFileSync(join(clone, 'package.json'), 'utf8'), pkg('0.1.0'));
});

test('with --ref the scan reads the tagged commit, not the current work tree', t => {
  const source = released(t, { 'package.json': pkg('0.2.0'), 'doc.md': 'restricted-phrase', '.gitignore': 'private/\n' }); put(source, { 'private/denylist.txt': 'restricted-phrase\n' });
  put(source, { 'doc.md': 'clean now' }); git(source, 'add', '-A'); git(source, 'commit', '-qm', 'Later');
  const clone = repo(t, { 'package.json': pkg('0.1.0') });
  const result = publicExport(source, clone, undefined, undefined, 'v0.2.0');
  assert.equal(result.ok, false); assert.deepEqual(result.found.map(x => x.file), ['doc.md']);
});

test('a failed scan removes new ignored files it created and keeps existing ignored ones', t => {
  const source = released(t, { 'package.json': pkg('0.2.0'), 'build/out.txt': 'new', 'build/deep/more.txt': 'new', 'src/a.mjs': 'new', '.gitignore': 'private/\n' }); put(source, { 'private/denylist.txt': 'unrelated-phrase\n' });
  const clone = repo(t, { 'package.json': pkg('0.1.0'), '.gitignore': 'build/\n*.log\n' });
  put(clone, { 'build/mine.txt': 'keep', 'keep.log': 'keep' });
  let calls = 0;
  const result = publicExport(source, clone, undefined, () => ++calls === 1 ? { ok: true, found: [] } : { ok: false, found: [{ file: 'src/a.mjs', kind: 'path' }] });
  assert.equal(result.ok, false); assert.equal(result.restored, true);
  assert.equal(readFileSync(join(clone, 'build/mine.txt'), 'utf8'), 'keep');
  assert.equal(readFileSync(join(clone, 'keep.log'), 'utf8'), 'keep');
  assert.equal(existsSync(join(clone, 'build/out.txt')), false);
  assert.equal(existsSync(join(clone, 'build/deep')), false);
  assert.equal(existsSync(join(clone, 'src')), false);
  assert.equal(git(clone, 'status', '--porcelain').trim(), '');
});

const odd = { tab: 'a\tb.txt', newline: 'c\nd.txt', backslash: 'e\\f.txt' };
const oddFiles = Object.fromEntries(Object.values(odd).map(name => [name, 'public']));
const oddSource = t => { const source = released(t, { 'package.json': pkg('0.2.0'), 'src/a.mjs': 'new', ...oddFiles, '.gitignore': 'private/\n' }); put(source, { 'private/denylist.txt': 'unrelated-phrase\n' }); return source; };

test('names with a tab, a newline or a backslash are checked exactly: an ignored original is preserved and the export refused', t => {
  const source = oddSource(t);
  for (const name of Object.values(odd)) {
    const clone = repo(t, { 'package.json': pkg('0.1.0'), '.gitignore': '*.txt\n!package.json\n' });
    put(clone, { [name]: 'mine' });
    assert.throws(() => publicExport(source, clone), /overwrite files in the clone that git does not track/, JSON.stringify(name));
    assert.equal(readFileSync(join(clone, name), 'utf8'), 'mine');
  }
});

test('new ignored files with a tab, a newline or a backslash in the name are removed after a failed scan', t => {
  const source = oddSource(t), clone = repo(t, { 'package.json': pkg('0.1.0'), '.gitignore': '*.txt\n!package.json\n' });
  put(clone, { 'keep.txt': 'mine' });
  let calls = 0;
  const result = publicExport(source, clone, undefined, () => ++calls === 1 ? { ok: true, found: [] } : { ok: false, found: [{ file: 'src/a.mjs', kind: 'path' }] });
  assert.equal(result.ok, false); assert.equal(result.restored, true);
  for (const name of Object.values(odd)) assert.equal(existsSync(join(clone, name)), false, JSON.stringify(name));
  assert.equal(readFileSync(join(clone, 'keep.txt'), 'utf8'), 'mine');
  assert.equal(git(clone, 'status', '--porcelain').trim(), '');
});
