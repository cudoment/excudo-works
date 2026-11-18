import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export const defaults = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  timeoutMs: 120000, agentTimeoutMs: 1200000, workerPermissions: { claude: { mode: 'acceptEdits', allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash(npx --no-install excudo:*)'] }, codex: { sandbox: 'workspace-write' } }, improvePermissions: { claude: { mode: 'acceptEdits', allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash(git switch:*)', 'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git add:*)', 'Bash(git commit:*)', 'Bash(npm test:*)', 'Bash(npx --no-install excudo:*)'] }, codex: { sandbox: 'workspace-write' } }, manualWindowMinutes: 60, idle: true,
  steps: [], disabled: [],
  report: { file: 'weekly.md', days: 7 },
  policy: 'policy.json', invariants: 'invariants.json',
  principles: true,
  review: false, backup: false, home: false, notifications: false, scheduler: false,
};
export function findRoot(from = process.cwd()) {
  let root = resolve(from);
  while (!existsSync(join(root, 'excudo.config.mjs'))) {
    const up = dirname(root); if (up === root) throw new Error('No workspace found. Run excudo-works init <folder>.'); root = up;
  }
  return root;
}
export async function loadConfig(from) {
  const root = findRoot(from);
  const engine = (await import(`${pathToFileURL(join(root, 'excudo.config.mjs')).href}?t=${randomUUID()}`)).default ?? {};
  const separate = join(root, 'works.config.mjs');
  const works = existsSync(separate) ? (await import(`${pathToFileURL(separate).href}?t=${randomUUID()}`)).default : engine.works ?? {};
  if (!works || typeof works !== 'object' || Array.isArray(works)) throw new Error('works settings must be an object.');
  const config = { ...defaults, ...works, workerPermissions: { claude: { ...defaults.workerPermissions.claude, ...works.workerPermissions?.claude }, codex: { ...defaults.workerPermissions.codex, ...works.workerPermissions?.codex } }, improvePermissions: { claude: { ...defaults.improvePermissions.claude, ...works.improvePermissions?.claude }, codex: { ...defaults.improvePermissions.codex, ...works.improvePermissions?.codex } }, report: { ...defaults.report, ...works.report } };
  if (!['en', 'ko'].includes(engine.locale ?? 'en')) throw new Error('locale must be en or ko.');
  new Intl.DateTimeFormat('en', { timeZone: config.timezone });
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0 || !Number.isFinite(config.manualWindowMinutes) || config.manualWindowMinutes < 0) throw new Error('Timeout and manual window must be valid numbers.');
  if (!Number.isFinite(config.agentTimeoutMs) || config.agentTimeoutMs <= 0) throw new Error('agentTimeoutMs must be positive.');
  if (config.backup && (typeof config.backup !== 'object' || Array.isArray(config.backup))) throw new Error('backup must be false or an object with folder and password source.');
  if (config.backup?.keep !== undefined && (!Number.isInteger(config.backup.keep) || config.backup.keep < 1)) throw new Error('backup.keep must be a positive integer.');
  if (config.backup && ('password' in config.backup || 'passphrase' in config.backup)) throw new Error('Backup passwords must come from an environment variable or the OS keychain.');
  const permissions = config.workerPermissions;
  if (!permissions || !['default', 'acceptEdits', 'plan'].includes(permissions.claude?.mode) || !Array.isArray(permissions.claude?.allowedTools) || permissions.claude.allowedTools.some(tool => typeof tool !== 'string') || !['workspace-write', 'read-only'].includes(permissions.codex?.sandbox)) throw new Error('Invalid worker permission profile.');
  const improve = config.improvePermissions;
  if (!['default', 'acceptEdits', 'plan'].includes(improve.claude?.mode) || !Array.isArray(improve.claude?.allowedTools) || improve.claude.allowedTools.some(tool => typeof tool !== 'string') || !['workspace-write', 'read-only'].includes(improve.codex?.sandbox)) throw new Error('Invalid improvement permission profile.');
  if (!Array.isArray(config.steps) || !Array.isArray(config.disabled)) throw new Error('steps and disabled must be arrays.');
  if (!Number.isInteger(config.report.days) || config.report.days < 1 || config.report.days > 366) throw new Error('report.days must be 1 to 366.');
  const ids = new Set();
  for (const step of config.steps) {
    if (!step || !/^[a-z][a-z0-9-]*$/.test(step.id) || ids.has(step.id)) throw new Error('Step IDs must be unique simple names.');
    if (Array.isArray(step.command) && (!step.command.length || step.command.some(value => typeof value !== 'string' || !value))) throw new Error(`Step ${step.id} needs a nonempty string argv array.`);
    if ((typeof step.command !== 'string' && !Array.isArray(step.command)) && typeof step.script !== 'string' && !['sources', 'edits', 'reflect', 'skills', 'queue', 'report', 'review', 'backup', 'home'].includes(step.id)) throw new Error(`Step ${step.id} needs command or script.`);
    if (step.timeoutMs !== undefined && (!Number.isFinite(step.timeoutMs) || step.timeoutMs <= 0)) throw new Error(`Invalid timeout for ${step.id}.`);
    ids.add(step.id);
  }
  return { root, engine, config, cacheDir: resolve(root, engine.cache ?? '.excudo'), graph: resolve(root, engine.graph ?? 'notes'), locale: engine.locale ?? 'en' };
}
export const dayKey = (date, timezone) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
