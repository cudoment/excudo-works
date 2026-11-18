import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { atomic, inside } from './files.mjs';
import { statePaths, stateFile, readState, writeState } from './state.mjs';
import { withWorkspaceLock } from './lock.mjs';
import { underGraph, saveWritten } from './engine.mjs';
export const fingerprint = text => createHash('sha256').update(text).digest('hex').slice(0, 16);
export const defaultPolicy = { version: 1, applyTaskEdits: true, allowCompletion: false, comments: 'judge', codeRequests: 'improvement', decisions: {} };
export const openItems = items => items.filter(item => !['closed', 'answered'].includes(item.status));
export const sourceLines = text => (text.match(/[^\n]*(?:\n|$)/g) ?? []).filter(Boolean).map(chunk => ({ text: chunk.replace(/\r?\n$/, ''), ending: chunk.endsWith('\r\n') ? '\r\n' : chunk.endsWith('\n') ? '\n' : '' }));
const TASK_LINE = /^- (?:DONE|DOING|WAITING) .*? <!-- task:[a-f0-9]+ -->\s*$/;
// Splits a report line into generated text and an owner comment. A known generated line (or a task
// line, whose marker ends it) is never cut at a separator that belongs to its own title or question.
export function reportLine(line, known = new Set()) {
  const text = line.replace(/\r$/, '');
  if (known.has(text) || TASK_LINE.test(text)) return { core: text, comment: null };
  let core = null;
  for (const old of known) if (old && text.startsWith(`${old} // `) && (core === null || old.length > core.length)) core = old;
  if (core !== null) return { core, comment: text.slice(core.length + 4).trim() };
  const at = text.indexOf(' // ');
  return { core: at < 0 ? text : text.slice(0, at), comment: at < 0 ? null : text.slice(at + 4).trim() };
}
export function closeItem(pending, item, reason = 'done') {
  if (!item) return;
  item.status = 'closed'; item.closedAt = new Date().toISOString(); item.reason = reason;
  if (!pending.applied.some(old => old.id === item.id)) pending.applied.push({ id: item.id, at: item.closedAt });
}
function collect(ws) {
  const state = readState(ws, 'report'), pending = readState(ws, 'edits');
  const policy = { ...defaultPolicy, ...readState(ws, 'policy') };
  const file = inside(ws.root, ws.config.report.file);
  if (!existsSync(file) || !state.text) return pending;
  const text = readFileSync(file, 'utf8');
  if (text === state.text) return pending;
  const oldLines = new Set(sourceLines(state.text).map(line => line.text));
  const parsed = sourceLines(text).map(line => ({ ...reportLine(line.text, oldLines), full: line.text }));
  const seen = id => pending.items.some(item => item.id === id) || pending.improvements.some(item => item.id === id) || pending.applied.some(item => item.id === id);
  const add = item => { if (!seen(item.id)) pending.items.push({ ...item, status: 'open' }); };
  const byId = new Map();
  for (const line of parsed) {
    const match = line.core.match(/^- (DONE|DOING|WAITING) (.*?) <!-- task:([a-f0-9]+) -->\s*$/);
    if (match) {
      if (byId.has(match[3])) throw new Error('Duplicate task marker; preserve report before resolving.');
      byId.set(match[3], { status: match[1], title: match[2] });
    }
  }
  for (const task of state.tasks) {
    const edited = byId.get(task.id);
    if (edited?.status === task.status && edited?.title === task.title) continue;
    const id = fingerprint(`${state.generation}:${task.id}:${JSON.stringify(edited)}`);
    if (!edited) { add({ id, kind: 'decision', task: task.id, taskSnapshot: task, question: 'This task was removed or reformatted. What should happen to the memo task?' }); continue; }
    const automatic = policy.applyTaskEdits && (edited.status !== 'DONE' || task.status === 'DONE' || policy.allowCompletion || policy.decisions?.[id] === 'apply');
    add({ id, kind: 'task-edit', task: task.id, taskSnapshot: structuredClone(task), edited, automatic, question: automatic ? 'Pending permitted task edit.' : 'Apply this title or status edit?' });
  }
  for (const { core, comment, full } of parsed) {
    if (!comment || oldLines.has(full)) continue;
    const id = fingerprint(`${state.generation}:${full}`);
    if (seen(id)) continue;
    const respondsTo = core.match(/\[([a-f0-9]{16})\]/)?.[1];
    const original = pending.items.find(item => item.id === respondsTo && item.status !== 'closed');
    const improvement = pending.improvements.find(item => item.id === respondsTo && item.status !== 'closed');
    if (/^(?:done|dismiss|완료|무시|닫기)$/i.test(comment) && (original || improvement)) {
      closeItem(pending, original ?? improvement, comment); pending.applied.push({ id, at: new Date().toISOString() }); continue;
    }
    if (original?.edited && /^(?:apply|yes|approve|적용|승인|예)$/i.test(comment)) {
      original.approved = true; original.status = 'open'; pending.applied.push({ id, at: new Date().toISOString() }); continue;
    }
    if (/^(?:improve|code|개선|코드):\s*/i.test(comment) && policy.codeRequests === 'improvement') {
      pending.improvements.push({ id, text: comment.replace(/^(?:improve|code|개선|코드):\s*/i, ''), status: 'open' });
      pending.applied.push({ id, at: new Date().toISOString() });
      closeItem(pending, original ?? improvement, 'improvement');
    } else {
      if (original || improvement) (original ?? improvement).status = 'answered';
      add({ id, kind: 'comment', text: comment, context: core, respondsTo, task: core.match(/<!-- task:([a-f0-9]+) -->/)?.[1], question: 'Which memo change does this comment request?' });
    }
  }
  const region = value => value.match(/<!-- excudo-works:report:start -->([\s\S]*?)<!-- excudo-works:report:end -->/)?.[1] ?? '';
  const previous = new Set(sourceLines(region(state.text)).map(line => line.text).filter(Boolean));
  const current = new Set(sourceLines(region(text)).map(line => line.text).filter(Boolean));
  for (const [from, to, kind] of [[current, previous, 'added'], [previous, current, 'removed']]) for (const line of from) {
    if (kind === 'removed' && [...to].some(value => reportLine(value, oldLines).core === line && reportLine(value, oldLines).comment)) continue;
    if (to.has(line) || /<!-- task:[a-f0-9]+ -->/.test(line) || line.includes(' // ')) continue;
    add({ id: fingerprint(`${state.generation}:${kind}:${line}`), kind: 'report-edit', text: line, question: `Review ${kind} generated report content: ${line.slice(0, 300)}` });
  }
  atomic(join(statePaths(ws).works, 'report-edited.md'), text);
  return writeState(ws, 'edits', pending);
}
export function collectEdits(ws) { return withWorkspaceLock(ws, () => collect(ws)); }
export function applyTask(ws, task, edited) {
  if (!task?.file || !Number.isInteger(task.line) || /(?:^|[\\/])views[\\/]/.test(task.file)) return null;
  if (!edited || !['DONE', 'DOING', 'WAITING'].includes(edited.status) || typeof edited.title !== 'string' || !edited.title.trim() || /[\r\n]|<!--/.test(edited.title)) return null;
  const file = inside(ws.root, task.file), source = readFileSync(file, 'utf8'), lines = sourceLines(source);
  if (lines[task.line]?.text !== task.source) return null;
  atomic(join(statePaths(ws).works, 'before', `${fingerprint(task.file)}.md`), source);
  lines[task.line].text = task.source.replace(/\b(DONE|DOING|WAITING)\b.*$/, () => `${edited.status} ${edited.title}`);
  if (readFileSync(file, 'utf8') !== source) throw new Error('Source changed during edit sync; retry after writing stops.');
  const written = lines.map(line => line.text + line.ending).join(''); atomic(file, written);
  return { file: task.file, written };
}
// Records written files as unsaved before asking the engine to commit them, so a failed save is
// retried by the next edits step instead of leaving uncommitted memo changes without a record.
export async function saveTracked(ws, pending, writes, options = {}) {
  pending.dirtyFiles = [...new Set([...pending.dirtyFiles, ...writes.map(item => item.file)])];
  Object.assign(pending, writeState(ws, 'edits', pending));
  if (!pending.dirtyFiles.length) return;
  await saveWritten(ws, pending.dirtyFiles, { ...options, hashes: new Map(writes.map(item => [item.file, item.written])) });
  pending.dirtyFiles = []; Object.assign(pending, writeState(ws, 'edits', pending));
}
export async function syncEdits(ws, options = {}) {
  return withWorkspaceLock(ws, async () => {
    const pending = collect(ws), writes = [];
    const result = await underGraph(ws, () => {
      for (const item of openItems(pending.items)) {
        if (!item.edited || !(item.automatic || item.approved)) continue;
        const written = applyTask(ws, item.taskSnapshot, item.edited);
        if (!written) { item.kind = 'conflict'; item.automatic = false; item.approved = false; item.question = 'The source changed or belongs to Home. Review both versions.'; continue; }
        writes.push(written); closeItem(pending, item, 'applied');
        Object.assign(pending.applied.find(entry => entry.id === item.id), { task: item.task, file: written.file });
      }
      return { files: writes.map(item => item.file) };
    }, options);
    if (result.deferred) { pending.deferred = true; Object.assign(pending, writeState(ws, 'edits', pending)); }
    else { delete pending.deferred; await saveTracked(ws, pending, writes, options); }
    return pending;
  });
}
export function closeImprovement(ws, id) {
  return withWorkspaceLock(ws, () => {
    const pending = readState(ws, 'edits'), item = pending.improvements.find(entry => entry.id === id);
    if (!item) throw new Error('Improvement request not found.');
    closeItem(pending, item); writeState(ws, 'edits', pending); return item;
  });
}
