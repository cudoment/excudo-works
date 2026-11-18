import { existsSync, lstatSync, realpathSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readJSON } from './files.mjs';
import { migrations, readState, statePaths } from './state.mjs';
import { packageInfo, satisfies } from './package-info.mjs';
import { passwordSource } from './backup.mjs';
import { loadConfig } from './config.mjs';
import { checkPrinciples, instructionHealth } from './principles.mjs';
import { skillNames } from './skill-check.mjs';
import { scheduleInfo } from './scheduler.mjs';
import { sync } from './process.mjs';
export function engineVersion(root) {
  try {
    const require = createRequire(join(root, 'package.json'));
    const entry = require.resolve('excudo');
    let path = entry;
    for (let i = 0; i < 4; i++) { path = join(path, '..'); const pkg = readJSON(join(path, 'package.json'), {}); if (pkg.name === 'excudo') return pkg.version; }
  } catch {}
  return readJSON(join(root, 'node_modules/excudo/package.json'), {}).version;
}
export function supportedEngine(version) { return satisfies(version, packageInfo().peerDependencies.excudo); }
export async function doctor(root, { probe = sync } = {}) {
  const checks = [], add = (id, status, detail, fix) => checks.push({ id, status, detail, ...(fix ? { fix } : {}) });
  const [major, minor] = process.versions.node.split('.').map(Number);
  add('node', major > 22 || major === 22 && minor >= 16 ? 'ok' : 'error', process.versions.node, 'Install Node >=22.16.');
  let ws;
  try { ws = await loadConfig(root); add('config', 'ok', 'Workspace and works settings loaded.'); }
  catch (error) { add('config', 'error', error.message, 'Run excudo-works init or repair the settings.'); return { ok: false, checks }; }
  const version = engineVersion(ws.root);
  add('engine', !version ? 'error' : supportedEngine(version) ? 'ok' : 'warning', version ?? 'Engine missing.', `npm install --save-dev excudo@${packageInfo().peerDependencies.excudo}`);
  try { const result = checkPrinciples(ws); add('principles', result.ok ? 'ok' : 'error', result.skipped ? 'Disabled.' : result.detail); }
  catch (error) { add('principles', 'error', error.message, 'Initialize the kit or review owner principles and invariants.json.'); }
  try {
    const policy = readState(ws, 'policy');
    const valid = policy?.version === 1 && ['judge', 'ask'].includes(policy.comments ?? 'judge') && typeof policy.applyTaskEdits === 'boolean';
    add('policy', valid ? 'ok' : 'error', valid ? 'Judgment policy loaded.' : 'Policy missing or invalid.', 'Run init for a missing policy, or review policy.json.');
  } catch (error) { add('policy', 'error', error.message, 'Repair the JSON judgment policy.'); }
  for (const name of Object.keys(migrations)) {
    try { readState(ws, name); add(`state:${name}`, 'ok', `${name} state is readable and supported.`); }
    catch (error) { add(`state:${name}`, 'error', error.message, 'Preserve a copy and update before migrating newer state.'); }
  }
  const health = await instructionHealth(ws); add('instructions', health.ok ? 'ok' : 'warning', health.detail, 'Use excudo instructions --check --json; preserve owner principles.');
  add('worker-permissions', 'ok', JSON.stringify(ws.config.workerPermissions));
  add('improve-permissions', 'ok', JSON.stringify(ws.config.improvePermissions));
  const tools = [...new Set([ws.engine.agents?.worker, ...(ws.engine.agents?.reviewers ?? [])].map(setting => setting?.tool).filter(tool => ['claude', 'codex'].includes(tool)))];
  for (const tool of tools) { const found = probe(process.platform === 'win32' ? 'where' : 'which', [tool], ws.root).status === 0; add(`worker-cli:${tool}`, found ? 'ok' : 'warning', found ? `${tool} is on PATH.` : `${tool} was not found on PATH.`, `Install the ${tool} CLI and make it available to the scheduler's PATH, or choose another worker with npx --no-install excudo agents.`); }
  add('activity', ws.engine.conversations ? 'ok' : 'warning', ws.engine.conversations ? 'Engine conversation and Git activity enabled.' : 'conversations is off; Activity falls back to Git logs from engine work folders.', 'Set conversations in excudo.config.mjs to include agent sessions.');
  for (const name of skillNames) {
    const paths = ['.agents', '.claude', '.codex'].map(area => join(ws.root, area, 'skills', name));
    const target = join(ws.root, 'node_modules/excudo-works/skills', name);
    const linked = paths.every(path => { try { return lstatSync(path).isSymbolicLink() && realpathSync(path) === realpathSync(target); } catch { return false; } });
    add(`skill:${name}`, linked ? 'ok' : 'warning', linked ? 'Linked to installed package.' : 'Missing, changed or uninstalled skill.', 'Install excudo-works, then rerun excudo-works init .; existing user skill folders are preserved.');
  }
  for (const area of ['.agents', '.claude', '.codex']) {
    const dir = join(ws.root, area, 'skills');
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (lstatSync(path).isSymbolicLink() && !existsSync(path)) add(`broken-link:${area}/${name}`, 'warning', 'Broken workspace skill link.', 'Run update to remove dropped kit-owned links; inspect user-owned links manually.');
    }
  }
  if (ws.config.backup) {
    const source = passwordSource(ws.config.backup);
    // Run the helper itself: a present executable can still fail, for example on a blocked script policy. Its output is never kept.
    const available = source.command ? (() => { const run = probe(source.command[0], source.command.slice(1), ws.root); return run.status === 0 && Boolean(run.stdout); })() : source.kind === 'environment' && Boolean(process.env[source.variable]);
    add('backup-password', available && (!ws.config.scheduler || source.safeForSchedule) ? 'ok' : 'warning', `Password source: ${source.kind}${source.command ? (available ? '; helper ran successfully' : '; helper could not read the password') : ''}; scheduled source ${source.safeForSchedule ? 'configured' : 'not provisioned'}.`, 'Use the OS credential store or provision the named environment variable in the scheduler service; never write the password in a job file.');
  }
  let scheduler;
  try { scheduler = scheduleInfo(ws); add('scheduler', !scheduler.enabled || scheduler.registered ? 'ok' : 'warning', !scheduler.enabled ? 'Disabled.' : scheduler.registered ? 'Registered.' : 'Not registered or entry differs.', scheduler.instructions); }
  catch (error) { add('scheduler', 'error', error.message); }
  if (ws.config.notifications) {
    const command = ws.config.notifications.command;
    const found = Array.isArray(command) && command.length && sync(process.platform === 'win32' ? 'where' : 'which', [command[0]], ws.root).status === 0;
    add('notifications', found ? 'ok' : 'warning', 'Optional command receives a JSON summary on stdin.', 'Set notifications: { command: [executable, ...args] }.');
  }
  if (ws.config.orca) { const probe = sync('orca', ['status', '--json'], ws.root); add('integration', probe.status === 0 ? 'ok' : 'warning', 'Optional editor integration.', 'Start the editor, or disable works.orca.'); }
  if (existsSync(statePaths(ws).lock)) add('lock', 'warning', 'A run lock exists.', 'Inspect owner.json; confirm the process stopped before removing a stale lock.');
  return { ok: !checks.some(x => x.status === 'error'), checks, scheduler };
}
