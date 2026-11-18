import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inside, readJSON } from './files.mjs';
export const PRINCIPLES_START = '<!-- works:principles:start -->';
export const PRINCIPLES_END = '<!-- works:principles:end -->';
export function principlesText(text) {
  const start = text.indexOf(PRINCIPLES_START), end = text.indexOf(PRINCIPLES_END);
  if (start < 0 || end < start || text.indexOf(PRINCIPLES_START, start + 1) >= 0 || text.indexOf(PRINCIPLES_END, end + 1) >= 0) throw new Error('Missing or ambiguous owner principles markers.');
  return text.slice(start + PRINCIPLES_START.length, end).trim().replaceAll('\r\n', '\n');
}
export function checkPrinciples(ws) {
  if (!ws.config.principles) return { ok: true, skipped: true };
  const text = readFileSync(join(ws.root, 'AGENTS.md'), 'utf8');
  const record = readJSON(inside(ws.root, ws.config.invariants), {});
  return { ok: record.version === 1 && record.text === principlesText(text), detail: 'Owner principles must match invariants.json. Change both only after the owner approves a principles change.' };
}
export async function instructionHealth(ws) {
  const { engineRun } = await import('./process.mjs');
  const result = await engineRun(ws.root, ['instructions', '--check', '--json'], { timeoutMs: 15000 });
  try { const value = JSON.parse(result.output); return { ...value, ok: !value.over, detail: value.over ? `Engine instruction budget exceeded: ${value.bytes}/${value.limit} bytes.` : 'Engine instruction budget is within its limit.' }; }
  catch { return { ok: false, unavailable: true, detail: 'Engine instruction budget could not be checked; run excudo instructions --check --json.' }; }
}
export function checkHome(text, { personal = 'Personal plans', work = 'Work', before, allowWork = false } = {}) {
  const headingAt = (value, heading) => { const lines = value.split('\n'); let offset = 0; for (const line of lines) { if (line.trimEnd() === `## ${heading}`) return offset; offset += line.length + 1; } return -1; };
  const p = headingAt(text, personal), w = headingAt(text, work);
  const questions = [...text.matchAll(/```(?:query|status|tasks)\b/g)].map(x => x.index);
  const unchanged = !before || allowWork || text.slice(w) === before.slice(headingAt(before, work));
  return { ok: p >= 0 && w > p && questions.every(i => i > w) && unchanged, ordered: p >= 0 && w > p, workPreserved: unchanged };
}
