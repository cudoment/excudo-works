import { join } from 'node:path';
import { loadConfig } from './config.mjs';
import { statePaths, readState } from './state.mjs';
import { withWorkspaceLock } from './lock.mjs';
import { json } from './files.mjs';
export async function skillRun(name, argv = process.argv.slice(2)) {
  try {
    const manual = !argv.includes('--scheduled') && process.env.EXCUDO_WORKS_MANUAL !== 'false';
    argv = argv.filter(value => value !== '--scheduled');
    const ws = await loadConfig();
    return await withWorkspaceLock(ws, async () => { let result;
    if (name === 'works-daily') { const { runPipeline } = await import('./pipeline.mjs'); result = await runPipeline(ws, { manual }); }
    if (name === 'works-sync-edits') { const { syncEdits } = await import('./edits.mjs'); const { judgeComments } = await import('./judgment.mjs'); const pending = await syncEdits(ws, { manual }); result = pending.deferred ? { code: 75, output: 'Memo edits deferred by the engine idle gate.' } : await judgeComments(ws, { manual }); process.exitCode = result.code === 0 ? 0 : 1; }
    if (name === 'works-weekly-report') { const { writeReport } = await import('./report.mjs'); result = await writeReport(ws); }
    if (name === 'works-cross-review') {
      if (!ws.config.review) throw new Error('Enable works.review first.');
      const { crossReview } = await import('./agents.mjs'); result = await crossReview(ws); process.exitCode = result.code === 0 ? 0 : 1;
    }
    if (name === 'works-backup') {
      const module = await import('./backup.mjs');
      if (argv[0] === 'restore') { if (argv.length !== 3) throw new Error('Usage: run.mjs restore <archive> <new-folder>'); result = module.restore(ws, argv[1], argv[2]); }
      else if (argv.length) throw new Error('Usage: run.mjs [restore <archive> <new-folder>]');
      else result = await module.backup(ws);
    }
    if (name === 'works-home-layout') { const { gatherSkill } = await import('./skill-check.mjs'); result = await gatherSkill(name, ws); }
    if (name === 'works-push-guard') { const { pushGuard } = await import('../scripts/push-guard.mjs'); result = pushGuard(ws, argv[0] === 'remove' ? 'remove' : 'install'); }
    if (name === 'works-improve') {
      const { workerPlan } = await import('./agents.mjs');
      const requests = readState(ws, 'edits').improvements;
      const request = requests.find(x => x.status === 'open');
      if (!request) throw new Error('No open improvement request. Add // improve: <request> to a report line, then sync edits.');
      result = { request: request.id, ...workerPlan(ws, `Implement this improvement on an isolated branch: ${request.text}. Preserve owner principles; run relevant checks and request review before merging.`), executed: false };
      json(join(statePaths(ws).works, 'improvement-plan.json'), result);
    }
    console.log(JSON.stringify(result, null, 2));
    if (result?.ok === false) process.exitCode = 1;
    });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
