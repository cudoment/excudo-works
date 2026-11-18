import { existsSync, readFileSync, mkdirSync, writeFileSync, symlinkSync, lstatSync, readlinkSync, unlinkSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { atomic, inside } from './files.mjs';
import { engineRun, shellQuote } from './process.mjs';
import { fingerprint, defaultPolicy } from './edits.mjs';
import { PRINCIPLES_START, PRINCIPLES_END, principlesText } from './principles.mjs';
import { loadConfig } from './config.mjs';
import { statePaths, readState, writeState } from './state.mjs';
import { withWorkspaceLock } from './lock.mjs';
import { PACKAGE_ROOT, packageInfo } from './package-info.mjs';
import { skillNames } from './skill-check.mjs';
export { PACKAGE_ROOT } from './package-info.mjs';
const START = '<!-- excudo-works:start -->', END = '<!-- excudo-works:end -->';
const ownerPrinciples = '- Keep Home under the owner\'s control.\n- Preserve concurrent edits and unresolved decisions.\n- Never send messages, push, publish or change external systems without authorization.';
export function replaceOwned(text, block) {
  const a = text.indexOf(START), b = text.indexOf(END);
  if (a < 0 && b < 0) return `${text}${text && !text.endsWith('\n') ? '\n' : ''}\n${block}`.trimStart();
  if (a < 0 || b < a || text.indexOf(START, a + 1) >= 0 || text.indexOf(END, b + 1) >= 0) throw new Error('Owned instruction markers are ambiguous; repair them manually.');
  return text.slice(0, a) + block.trimEnd() + text.slice(b + END.length);
}
export function refreshOwned(subject, options = {}) { return withWorkspaceLock(subject, () => refreshLocked(subject, options)); }
function refreshLocked(subject, { locale = 'en', force = false } = {}) {
  const root = statePaths(subject).root, state = readState(subject, 'install'), result = [];
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    const path = join(root, name), text = existsSync(path) ? readFileSync(path, 'utf8') : '';
    const a = text.indexOf(START), b = text.indexOf(END);
    const oldBlock = a >= 0 && b >= a ? text.slice(a, b + END.length) : null;
    const block = readFileSync(join(PACKAGE_ROOT, 'template', locale, name), 'utf8');
    if (oldBlock && oldBlock !== block.trimEnd() && fingerprint(oldBlock) !== state.blocks[name] && !force) {
      result.push({ file: name, status: 'preserved', fix: 'Review the owned block, then use init --force or update --force to replace only that block.' }); continue;
    }
    atomic(path, replaceOwned(text, block)); state.blocks[name] = fingerprint(block.trimEnd()); result.push({ file: name, status: 'refreshed' });
  }
  writeState(subject, 'install', state); return result;
}
export function installSkillLinks(subject, { names = skillNames } = {}) {
  return withWorkspaceLock(subject, () => {
    const root = statePaths(subject).root, state = readState(subject, 'install'), results = [], kept = [];
    for (const entry of state.links) {
      if (names.includes(entry.name)) { kept.push(entry); continue; }
      const parent = inside(root, dirname(entry.path)), path = join(parent, entry.path.split(/[\\/]/).at(-1));
      let stat; try { stat = lstatSync(path); } catch {}
      if (stat?.isSymbolicLink() && resolve(dirname(path), readlinkSync(path)) === resolve(dirname(path), entry.target)) { unlinkSync(path); results.push({ file: path, status: 'removed' }); }
      else if (stat) { kept.push(entry); results.push({ file: path, status: 'preserved' }); }
    }
    state.links = kept;
    for (const name of names) for (const area of ['.agents', '.claude', '.codex']) {
      const path = join(root, area, 'skills', name);
      const destination = area === '.agents' ? join(root, 'node_modules/excudo-works/skills', name) : join(root, '.agents/skills', name);
      const target = process.platform === 'win32' ? destination : relative(dirname(path), destination);
      let present; try { present = lstatSync(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (present) { results.push({ file: path, status: present.isSymbolicLink() && resolve(dirname(path), readlinkSync(path)) === destination ? 'linked' : 'preserved' }); continue; }
      mkdirSync(dirname(path), { recursive: true }); symlinkSync(target, path, process.platform === 'win32' ? 'junction' : 'dir');
      state.links.push({ name, path: relative(root, path), target }); results.push({ file: path, status: 'linked' });
    }
    writeState(subject, 'install', state); return results;
  });
}
export async function initWorkspace(folder, { locale = 'en', force = false } = {}) {
  if (!['en', 'ko'].includes(locale)) throw new Error('Use --locale en or ko.');
  const root = resolve(folder); mkdirSync(root, { recursive: true });
  const commands = [], created = [], preserved = [];
  if (!existsSync(join(root, 'excudo.config.mjs'))) {
    // Run from the caller so an installed local engine can initialize a new folder.
    const result = await engineRun(process.cwd(), ['init', root, '--locale', locale], { timeoutMs: 60000 });
    if (result.code !== 0) return { ok: false, root, commands: [`npx excudo init ${shellQuote(root)} --locale ${locale}`], detail: 'Engine initialization is needed; run the command and retry.' };
  }
  const ws = await loadConfig(root); locale = ws.locale;
  return withWorkspaceLock(ws, () => {
  const put = (name, content) => {
    const path = inside(root, name);
    if (existsSync(path)) { preserved.push(name); return; }
    mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content, { flag: 'wx' }); created.push(name);
  };
  if (!ws.engine.works) put('works.config.mjs', readFileSync(join(PACKAGE_ROOT, 'template/works.config.mjs'), 'utf8'));
  put(ws.config.policy, `${JSON.stringify(defaultPolicy, null, 2)}\n`);
  const instructions = refreshOwned(ws, { locale, force });
  const agents = join(root, 'AGENTS.md'); let text = readFileSync(agents, 'utf8');
  if (!text.includes(PRINCIPLES_START) && !text.includes(PRINCIPLES_END)) {
    text += `\n## ${locale === 'ko' ? '사용자 원칙' : 'Owner principles'}\n\n${PRINCIPLES_START}\n${ownerPrinciples}\n${PRINCIPLES_END}\n`; atomic(agents, text);
  }
  put(ws.config.invariants, `${JSON.stringify({ version: 1, text: principlesText(text) }, null, 2)}\n`);
  const links = installSkillLinks(ws);
  if (!existsSync(join(root, 'node_modules/excudo-works/package.json'))) commands.push(`npm install --save-dev excudo-works@^${packageInfo().version}`);
  if (!existsSync(join(root, 'node_modules/excudo/package.json'))) commands.push('npm install');
  return { ok: true, root, created, preserved, instructions, links, commands };
  });
}
