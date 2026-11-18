import { existsSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { atomic, files, inside } from './files.mjs';
import { dayKey } from './config.mjs';
import { fingerprint, collectEdits, openItems, sourceLines } from './edits.mjs';
import { engineRun, sync } from './process.mjs';
import { statePaths, readState, writeState } from './state.mjs';
import { withWorkspaceLock } from './lock.mjs';
import { engineFolders, enginePrivateLine } from './engine.mjs';
const START = '<!-- excudo-works:report:start -->', END = '<!-- excudo-works:report:end -->';
export function collectTasks(ws, now = new Date()) {
  const since = new Date(now.getTime() - ws.config.report.days * 86400000);
  return files(ws.graph).filter(file => /\.mdx?$/.test(file) && !relative(ws.graph, file).split(/[\\/]/).includes('views')).flatMap(file => {
    const text = readFileSync(file, 'utf8'), lines = sourceLines(text).map(line => line.text); let fence = false;
    return lines.flatMap((source, line) => {
      if (/^\s*```/.test(source)) { fence = !fence; return []; }
      const match = !fence && source.match(/^\s*(?:[-*] )?(DONE|DOING|WAITING)\s+(.+)$/);
      if (!match) return [];
      // A dated completion is bounded by the report period; an undated one uses source mtime.
      const indent = source.match(/^\s*/)[0].length, properties = [];
      for (const child of lines.slice(line + 1)) {
        if (child.trim() && (child.match(/^\s*/)[0].length <= indent || /^\s*(?:[-*] )?(?:DONE|DOING|WAITING)\b/.test(child))) break;
        properties.push(child);
      }
      const stamp = properties.find(x => /^\s*(?:CLOSED|completed)::?/i.test(x))?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
      const inPeriod = stamp ? stamp >= dayKey(since, ws.config.timezone) && stamp <= dayKey(now, ws.config.timezone) : statSync(file).mtime >= since && statSync(file).mtime <= now;
      if (match[1] === 'DONE' && !inPeriod) return [];
      return [{ id: fingerprint(`${relative(ws.root, file)}:${line}`), file: relative(ws.root, file), line, source, status: match[1], title: match[2] }];
    });
  });
}
// Mirrors the engine's own Git activity: the owner's commits only (the repository's author email),
// no merges, one entry per repository even across worktrees, and private-looking subjects hidden.
// The engine does not export that collector, so a conversations-off workspace uses this copy.
export async function gitActivity(ws, now) {
  if (!ws.engine.conversations) {
    const commits = [], warnings = [], seen = new Set(), privateLine = await enginePrivateLine(ws);
    const since = new Date(now.getTime() - ws.config.report.days * 86400000).toISOString(), until = now.toISOString();
    for (const folder of await engineFolders(ws)) {
      const common = sync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], folder), top = sync('git', ['rev-parse', '--show-toplevel'], folder);
      if (common.status !== 0 || top.status !== 0) continue;
      let key; try { key = realpathSync(common.stdout.trim()); } catch { key = common.stdout.trim(); }
      if (seen.has(key)) continue; seen.add(key);
      const email = sync('git', ['config', 'user.email'], folder).stdout.trim();
      if (!email) continue;
      const result = sync('git', ['log', '--all', '--no-merges', '--fixed-strings', `--since=${since}`, `--until=${until}`, `--author=<${email}>`, '--format=%h%x09%s', '-30'], folder);
      if (result.status !== 0) continue;
      for (const line of result.stdout.split('\n').filter(Boolean)) {
        const [hash, ...subject] = line.split('\t'), text = subject.join('\t').replace(/\s+/g, ' ').trim();
        commits.push({ folder: top.stdout.trim(), text: `${hash} ${privateLine && !privateLine(text) ? text : '(hidden: looked private)'}` });
      }
    }
    return { commits, warnings };
  }
  const collected = await engineRun(ws.root, ['activity', '--days', String(ws.config.report.days), '--json'], { timeoutMs: 20000 });
  if (collected.code !== 0) return { commits: [], warnings: ['Engine activity could not be collected.'] };
  const shown = await engineRun(ws.root, ['activity', 'show', '--days', String(ws.config.report.days)], { timeoutMs: 15000 });
  return shown.code === 0 ? { commits: [], warnings: [], text: shown.output.trim() } : { commits: [], warnings: ['Engine activity could not be rendered.'] };
}
function pruneBackups(ws, latest) {
  const dir = statePaths(ws).works, keep = Math.max(1, ws.config.report.keepBackups ?? 5);
  const names = readdirSync(dir).filter(name => /^report-before-[a-f0-9]+\.md$/.test(name) && name !== latest).map(name => ({ name, time: statSync(join(dir, name)).mtimeMs })).sort((a, b) => b.time - a.time || b.name.localeCompare(a.name));
  for (const { name } of names.slice(keep - 1)) rmSync(join(dir, name), { force: true });
}
export async function writeReport(ws, options = {}) { return withWorkspaceLock(ws, () => renderReport(ws, options)); }
async function renderReport(ws, { now = new Date(), activity, adapter } = {}) {
  const file = inside(ws.root, ws.config.report.file);
  const old = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const inputHash = fingerprint(old);
  const pending = collectEdits(ws), tasks = collectTasks(ws, now);
  const git = activity ?? await gitActivity(ws, now);
  const ko = ws.locale === 'ko';
  const headings = ko ? ['완료', '진행 중', '대기', '활동', '확인할 것'] : ['Done', 'Doing', 'Waiting', 'Activity', 'To check'];
  const parts = [`# ${ko ? '주간 보고' : 'Weekly report'}: ${now.toISOString().slice(0, 10)}`, ''];
  for (const [i, status] of ['DONE', 'DOING', 'WAITING'].entries()) {
    parts.push(`## ${headings[i]}`, '', ...tasks.filter(t => t.status === status).map(t => `- ${t.status} ${t.title} <!-- task:${t.id} -->`), '');
  }
  parts.push(`## ${headings[3]}`, '', ...git.commits.map(x => `- ${x.text} (${x.folder})`), ...(git.text ? [git.text] : []), '', `## ${headings[4]}`, '');
  parts.push(...openItems(pending.items).map(item => `- [${item.id}] ${item.question}`), ...pending.improvements.filter(x => x.status === 'open').map(x => `- [${x.id}] Improvement: ${x.text}`), ...pending.dirtyFiles.map(file => `- Unsaved memo edit: ${file}; the engine save failed and the next edits step retries it.`), ...git.warnings.map(text => `- ${text}`));
  const additions = adapter ?? (ws.config.report.adapter ? await importAdapter(ws) : []);
  if (!Array.isArray(additions) || additions.some(x => typeof x !== 'string')) throw new Error('Report adapter must return an array of strings.');
  parts.push(...additions, '', ko ? '줄 끝에 ` // 적용`, ` // 완료`, ` // 무시` 또는 답변을 적습니다.' : 'Add answers or comments after ` // ` on a line.', '');
  const body = parts.join('\n');
  if (fingerprint(existsSync(file) ? readFileSync(file, 'utf8') : '') !== inputHash) throw new Error('Report changed during collection or rendering; retry without overwriting the owner edit.');
  const ending = old.includes('\r\n') ? '\r\n' : '\n';
  const block = `${START}\n${body}${END}`.replace(/\r?\n/g, () => ending);
  let text;
  if (!old) text = block + ending;
  else {
    const a = old.indexOf(START), b = old.indexOf(END);
    if (a < 0 || b < a || old.indexOf(START, a + 1) >= 0 || old.indexOf(END, b + 1) >= 0) throw new Error('Report markers are missing or ambiguous; restore them before refreshing.');
    text = old.slice(0, a) + block + old.slice(b + END.length);
    atomic(join(statePaths(ws).works, `report-before-${inputHash}.md`), old); pruneBackups(ws, `report-before-${inputHash}.md`);
  }
  if (fingerprint(existsSync(file) ? readFileSync(file, 'utf8') : '') !== inputHash) throw new Error('Report changed before writing; retry without overwriting the owner edit.');
  atomic(file, text); writeState(ws, 'report', { text, tasks, generation: readState(ws, 'report').generation + 1, at: now.toISOString() });
  return { file, tasks: tasks.length, pending: pending.items.length };
}
async function importAdapter(ws) {
  const { pathToFileURL } = await import('node:url');
  const module = await import(pathToFileURL(inside(ws.root, ws.config.report.adapter)).href);
  return module.default({ root: ws.root, tasks: collectTasks(ws) });
}
export function writeBacklog(ws, results) { return withWorkspaceLock(ws, () => backlogLocked(ws, results)); }
function backlogLocked(ws, results) {
  const pending = readState(ws, 'edits');
  const text = ['# Automation backlog', '', ...results.map(x => `- ${x.id}: ${x.status}${x.detail ? ` (${x.detail})` : ''}`), '', ...openItems(pending.items).map(x => `- Decision ${x.id}: ${x.question}`), ...pending.improvements.filter(x => x.status === 'open').map(x => `- [${x.id}] Improvement: ${x.text}`), ...pending.dirtyFiles.map(file => `- Unsaved memo edit ${file}: engine save failed; the next edits step retries it.`), ''].join('\n');
  const file = join(statePaths(ws).reports, 'works-backlog.md'); atomic(file, text); return file;
}
