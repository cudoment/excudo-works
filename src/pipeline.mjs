import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayKey } from './config.mjs';
import { inside, json, readJSON } from './files.mjs';
import { migrate } from './migrate.mjs';
import { checkPrinciples, instructionHealth, checkHome } from './principles.mjs';
import { engineRun, runCommand } from './process.mjs';
import { runAgent, crossReview } from './agents.mjs';
import { syncEdits } from './edits.mjs';
import { judgeComments } from './judgment.mjs';
import { writeBacklog, writeReport } from './report.mjs';
import { backup } from './backup.mjs';
import { withWorkspaceLock, lockToken } from './lock.mjs';
import { statePaths } from './state.mjs';
export const DEFAULT_STEPS = ['sources', 'edits', 'reflect', 'skills', 'queue', 'report'];
export { acquireLock } from './lock.mjs';
export function stepsOf(ws) {
  const steps = DEFAULT_STEPS.map(id => ({ id, daily: !['edits', 'queue', 'report'].includes(id) }));
  if (ws.config.review) steps.splice(steps.length - 1, 0, { id: 'review' });
  if (ws.config.backup) steps.splice(steps.length - 1, 0, { id: 'backup' });
  if (ws.config.home) steps.splice(steps.length - 1, 0, { id: 'home' });
  for (const custom of ws.config.steps) {
    const at = steps.findIndex(x => x.id === custom.id);
    if (at >= 0) steps[at] = { ...steps[at], ...custom }; else steps.splice(steps.length - 1, 0, custom);
  }
  return steps.filter(step => step.enabled !== false && !ws.config.disabled.includes(step.id));
}
export async function builtIn(ws, id, options = {}) {
  if (id === 'sources') return runAgent(ws, 'Use the installed excudo-sources skill to refresh configured sources. Follow AGENTS.md; record decisions for the owner instead of guessing.', options);
  if (id === 'reflect') return runAgent(ws, 'Use the installed excudo-reflect skill for this workspace. Follow AGENTS.md and leave decisions for the owner.', options);
  if (id === 'edits') { const result = await syncEdits(ws, options); return result.deferred ? { code: 75, output: 'Memo edits deferred by the engine idle gate.' } : judgeComments(ws, options); }
  if (id === 'skills') return engineRun(ws.root, ['skills', 'upkeep', '--json'], options);
  if (id === 'queue') return engineRun(ws.root, ['queue', '--json'], options);
  if (id === 'report') { const report = await writeReport(ws); return { code: 0, output: `Report: ${report.file}` }; }
  if (id === 'review') return crossReview(ws, options);
  if (id === 'backup') { const result = await backup(ws); return { code: 0, output: `Encrypted archive: ${result.file}` }; }
  if (id === 'home') {
    const text = readFileSync(inside(ws.root, ws.config.home.file), 'utf8');
    const result = checkHome(text, ws.config.home); return { code: result.ok ? 0 : 1, output: JSON.stringify(result) };
  }
  throw new Error(`Unknown step ${id}.`);
}
export async function runPipeline(ws, options = {}) { return withWorkspaceLock(ws, () => runLocked(ws, options)); }
async function runLocked(ws, { manual = false, only, now = new Date(), execute } = {}) {
  const steps = stepsOf(ws);
  if (only && !steps.some(step => step.id === only)) throw new Error(`Unknown or disabled step ${only}.`);
  const results = [], warnings = [];
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const recordsFile = join(statePaths(ws).works, 'records.json');
  const logDir = statePaths(ws).logs; mkdirSync(logDir, { recursive: true });
  const log = join(logDir, `works-${dayKey(now, ws.config.timezone)}.log`);
  const note = message => appendFileSync(log, `${new Date().toISOString()} ${message}\n`, { mode: 0o600 });
  try {
    const records = migrate(ws), today = dayKey(now, ws.config.timezone);
    if (manual) { records.manual = null; json(recordsFile, records); }
    const principles = checkPrinciples(ws), health = await instructionHealth(ws);
    const principlesBefore = ws.config.principles ? readFileSync(join(ws.root, 'AGENTS.md'), 'utf8').match(/<!-- works:principles:start -->[\s\S]*?<!-- works:principles:end -->/)?.[0] : null;
    const invariantsBefore = ws.config.principles ? readFileSync(inside(ws.root, ws.config.invariants), 'utf8') : null;
    if (!principles.ok) throw new Error(principles.detail);
    if (!health.ok) warnings.push({ id: 'instructions', status: 'warning', detail: health.detail });
    if (!manual && !only && records.manual && !records.manual.consumed && now.getTime() >= Date.parse(records.manual.at) && now.getTime() - Date.parse(records.manual.at) <= ws.config.manualWindowMinutes * 60000) {
      records.manual.consumed = true; json(recordsFile, records);
      const backlog = writeBacklog(ws, [{ id: 'run', status: 'skipped', detail: 'Fully successful manual run suppressed this scheduled run.' }]);
      return { ok: true, skipped: 'manual-window', results, backlog, log };
    }
    for (const step of steps.filter(x => !only || x.id === only)) {
      if (controller.signal.aborted) { results.push({ id: step.id, status: 'failed', detail: 'Interrupted.' }); break; }
      if (!manual && step.daily !== false && records.steps[step.id]?.day === today && records.steps[step.id]?.status === 'success') { results.push({ id: step.id, status: 'skipped', detail: 'Already succeeded today.' }); continue; }
      let result;
      const started = new Date().toISOString();
      try {
        if (!manual && ws.config.idle && !['report', 'backup'].includes(step.id)) {
          const idle = await engineRun(ws.root, ['idle', '--json'], { timeoutMs: 15000, signal: controller.signal });
          if (idle.code !== 0) result = { code: 75, output: 'Engine idle check deferred the step; retry when edits settle or automation resumes.' };
        }
        if (!result) {
          const options = { cwd: ws.root, env: { EXCUDO_WORKS_LOCK_TOKEN: lockToken(ws), EXCUDO_WORKS_LOCK_ROOT: ws.root, EXCUDO_WORKS_MANUAL: String(manual) }, timeoutMs: step.timeoutMs ?? (['sources', 'reflect', 'review', 'edits'].includes(step.id) ? ws.config.agentTimeoutMs : ws.config.timeoutMs), signal: controller.signal, onData: data => note(`${step.id}: ${data.trimEnd()}`) };
          if (execute) result = await execute(step, options);
          else if (step.script) result = await runCommand(process.execPath, [inside(ws.root, step.script)], options);
          else if (Array.isArray(step.command)) result = await runCommand(step.command[0], step.command.slice(1), options);
          else if (step.command) result = await runCommand(step.command, [], { ...options, shell: true });
          else result = await runCommand(process.execPath, [fileURLToPath(new URL('./step.mjs', import.meta.url)), step.id, ws.root, String(options.timeoutMs), String(manual)], { ...options, env: { EXCUDO_WORKS_LOCK_TOKEN: lockToken(ws), EXCUDO_WORKS_LOCK_ROOT: ws.root, EXCUDO_WORKS_MANUAL: String(manual) } });
        }
      } catch (error) { result = { code: 1, output: error.message }; }
      if (ws.config.principles && (readFileSync(join(ws.root, 'AGENTS.md'), 'utf8').match(/<!-- works:principles:start -->[\s\S]*?<!-- works:principles:end -->/)?.[0] !== principlesBefore || readFileSync(inside(ws.root, ws.config.invariants), 'utf8') !== invariantsBefore)) result = { code: 1, output: 'Owner principles changed during this run; review both files before continuing.' };
      const status = result.code === 0 ? 'success' : result.code === 75 ? 'deferred' : result.code === 124 ? 'timeout' : 'failed';
      const item = { id: step.id, day: today, status, at: new Date().toISOString(), detail: result.output?.trim().slice(-1000) ?? '' };
      records.steps[step.id] = item; records.history.push(item); records.history = records.history.slice(-1000);
      json(recordsFile, records); results.push(item);
      const recorded = await engineRun(ws.root, ['runs', 'add', `works:${step.id}`, '--status', status === 'success' ? 'ok' : status === 'deferred' ? 'deferred' : 'failed', '--since', started, `--reason=${item.detail}`], { timeoutMs: 15000 });
      if (recorded.code !== 0) warnings.push({ id: `record:${step.id}`, status: 'warning', detail: 'Engine run record could not be written.' });
      note(`${step.id}: ${status}`);
      if (result.output?.startsWith('Owner principles changed')) break;
    }
    const ok = results.every(x => ['success', 'skipped'].includes(x.status)) && !controller.signal.aborted;
    // A partial manual run never suppresses the next scheduled execution.
    records.lastRun = { at: now.toISOString(), ok, manual, only: only ?? null }; json(recordsFile, records);
    if (manual && !only && ok) { records.manual = { at: now.toISOString(), consumed: false }; json(recordsFile, records); }
    const backlog = writeBacklog(ws, [...results, ...warnings]);
    if (ws.config.notifications?.command) await runCommand(ws.config.notifications.command[0], ws.config.notifications.command.slice(1), { cwd: ws.root, input: JSON.stringify({ ok, backlog }), timeoutMs: 10000 });
    return { ok, results, warnings, log, backlog };
  } catch (error) {
    writeBacklog(ws, [...results, { id: 'run', status: 'failed', detail: error.message }]); throw error;
  } finally {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  }
}
