import { doctor } from './doctor.mjs';
import { engineRun } from './process.mjs';
export async function feedback(root, { engine } = {}) {
  const diagnostics = await doctor(root);
  const result = engine ?? await engineRun(root, ['feedback'], { timeoutMs: 20000 });
  // Keep potentially private paths and tool output in the local draft, never in the URL.
  const rows = diagnostics.checks.map(x => `- ${x.id}: ${x.status}${x.id === 'node' || x.id === 'engine' ? ` (${x.detail})` : ''}`);
  const engineNote = result.code === 0 ? result.output.trim() : 'Engine feedback is unavailable in this version. Run npx --no-install excudo start --report after upgrading.';
  const draft = ['## What happened', '', 'Describe the expected result and what happened.', '', '## Diagnostics', '', ...rows, '', '## Engine report (review before sharing)', '', engineNote, ''].join('\n');
  const params = new URLSearchParams({ title: '[Feedback] ', body: 'Describe the issue and paste the reviewed output of excudo-works feedback. Remove private paths, source names and credentials before sharing.' });
  return { ok: true, draft, url: `https://github.com/cudoment/excudo-works/issues/new?${params}`, note: 'This is a local draft. Review it before posting; nothing was sent.' };
}
