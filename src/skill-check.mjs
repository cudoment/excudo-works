import { existsSync, readFileSync, lstatSync, openSync, readSync, closeSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { readJSON, inside } from './files.mjs';
import { statePaths, readState } from './state.mjs';
import { loadConfig } from './config.mjs';
export const skillNames = ['works-daily', 'works-sync-edits', 'works-improve', 'works-weekly-report', 'works-cross-review', 'works-backup', 'works-home-layout', 'works-push-guard'];
export const criteria = {
  'works-daily': ['recorded', 'backlog', 'fullySucceeded'],
  'works-sync-edits': ['snapshotKept', 'conflictsPreserved', 'policyUsed'],
  'works-improve': ['requestRecorded', 'commandsReviewable', 'noAutomaticMerge'],
  'works-weekly-report': ['markers', 'tasksMatch', 'decisionsKept'],
  'works-cross-review': ['report', 'readOnly', 'reviewersConfigured'],
  'works-backup': ['encrypted', 'passwordNotStored', 'separateRestore'],
  'works-home-layout': ['ordered', 'workPreserved', 'ownerControlled'],
  'works-push-guard': ['installed', 'refusesPush', 'previousHookPreserved'],
};
export const evaluate = (name, facts) => criteria[name].map(id => ({ id, ok: facts[id] === true, message: `${id} must hold.` }));
export async function gatherSkill(name, ws) {
  if (name === 'works-daily') {
    const record = readState(ws, 'records');
    return { recorded: Boolean(record.lastRun), backlog: existsSync(join(statePaths(ws).reports, 'works-backlog.md')), fullySucceeded: record.lastRun?.ok === true };
  }
  if (name === 'works-sync-edits') {
    const pending = readState(ws, 'edits');
    return { snapshotKept: existsSync(join(statePaths(ws).works, 'report-edited.md')) || !(pending.applied?.length || pending.items?.length), conflictsPreserved: Array.isArray(pending.items) && pending.items.every(x => Boolean(x.question)), policyUsed: existsSync(inside(ws.root, ws.config.policy)) };
  }
  if (name === 'works-improve') {
    const plan = readJSON(join(statePaths(ws).works, 'improvement-plan.json'), {});
    return { requestRecorded: Boolean(plan.request), commandsReviewable: typeof plan.command === 'string' && plan.command.length > 0, noAutomaticMerge: plan.executed === false };
  }
  if (name === 'works-weekly-report') {
    const record = readState(ws, 'report');
    const file = inside(ws.root, ws.config.report.file), text = existsSync(file) ? readFileSync(file, 'utf8') : '';
    const pending = readState(ws, 'edits');
    return { markers: text.includes('<!-- excudo-works:report:start -->') && text.includes('<!-- excudo-works:report:end -->'), tasksMatch: Array.isArray(record.tasks) && record.tasks.every(x => text.includes(`<!-- task:${x.id} -->`)), decisionsKept: pending.items.filter(x => !['closed', 'answered'].includes(x.status)).every(x => text.includes(x.id)) };
  }
  if (name === 'works-cross-review') {
    const file = join(statePaths(ws).reports, 'works-review.md');
    return { report: existsSync(file) && readFileSync(file, 'utf8').trim().length > 0, readOnly: Boolean(readState(ws, 'review').readOnly), reviewersConfigured: (ws.engine.agents?.reviewers?.length ?? 0) > 0 };
  }
  if (name === 'works-backup') {
    const record = readState(ws, 'backup');
    let header = '';
    if (record.file && existsSync(record.file)) { const fd = openSync(record.file, 'r'); try { const data = Buffer.alloc(8); readSync(fd, data); header = data.toString(); } finally { closeSync(fd); } }
    const rel = record.lastRestore ? relative(ws.root, record.lastRestore.folder) : null;
    const separate = rel === null || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
    return { encrypted: header === 'EWORKS01', passwordNotStored: !('password' in (ws.config.backup || {})), separateRestore: separate };
  }
  if (name === 'works-home-layout') {
    const { checkHome } = await import('./principles.mjs');
    if (!ws.config.home?.file) return { ordered: false, workPreserved: false, ownerControlled: false };
    const result = checkHome(readFileSync(inside(ws.root, ws.config.home.file), 'utf8'), ws.config.home);
    return { ordered: result.ordered, workPreserved: result.workPreserved, ownerControlled: result.ok };
  }
  if (name === 'works-push-guard') {
    const { pushGuard } = await import('../scripts/push-guard.mjs');
    let result; try { result = pushGuard(ws.root); } catch { return { installed: false, refusesPush: false, previousHookPreserved: false }; }
    const text = result.installed ? readFileSync(result.hook, 'utf8') : '';
    return { installed: result.installed, refusesPush: /^exit 1$/m.test(text), previousHookPreserved: !existsSync(`${result.hook}.before-works`) || lstatSync(`${result.hook}.before-works`).isFile() };
  }
  throw new Error('Unknown kit skill.');
}
export async function checkMain(name, cases, argv = process.argv.slice(2)) {
  try {
    const { values } = parseArgs({ args: argv, options: { facts: { type: 'string' }, json: { type: 'boolean' }, 'self-test': { type: 'boolean' }, root: { type: 'string' } } });
    if (values['self-test']) {
      const results = JSON.parse(readFileSync(cases, 'utf8')).map(item => ({ name: item.name, ok: (evaluate(name, item.facts).every(x => x.ok) ? 'pass' : 'fail') === item.expect }));
      console.log(JSON.stringify(results)); process.exitCode = results.length && results.every(x => x.ok) ? 0 : 1; return;
    }
    const facts = values.facts ? JSON.parse(readFileSync(resolve(values.facts), 'utf8')) : await gatherSkill(name, await loadConfig(values.root));
    const checks = evaluate(name, facts), ok = checks.every(x => x.ok);
    console.log(values.json ? JSON.stringify({ ok, checks }) : checks.map(x => `${x.ok ? 'OK' : 'FAIL'} ${x.id}`).join('\n')); process.exitCode = ok ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
