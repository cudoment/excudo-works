import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refreshOwned, installSkillLinks } from './init.mjs';
import { PACKAGE_ROOT, packageInfo, satisfies } from './package-info.mjs';
import { withWorkspaceLock, lockToken } from './lock.mjs';
import { migrate } from './migrate.mjs';
import { runCommand, shellQuote } from './process.mjs';
import { engineVersion } from './doctor.mjs';
const newer = (a, b) => { const x = a.split(/[.-]/).slice(0, 3).map(Number), y = b.split(/[.-]/).slice(0, 3).map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
const isVersion = text => /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(text);
export async function update(ws, options = {}) { return withWorkspaceLock(ws, () => updateLocked(ws, options)); }
async function updateLocked(ws, { apply = false, force = false, registry, registryPeers, execute = runCommand, launch = runCommand } = {}) {
  const current = packageInfo().version, npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const query = args => execute(npm, ['view', ...args, '--json', '--fetch-retries=0', '--fetch-timeout=5000'], { cwd: ws.root, timeoutMs: 7000, shell: process.platform === 'win32' });
  const lookup = registry ?? await query(['excudo-works', 'version']);
  let latest; try { latest = JSON.parse(lookup.output); } catch {}
  if (!isVersion(latest)) latest = null;
  let peer = packageInfo().peerDependencies.excudo, peerKnown = true;
  if (latest && newer(latest, current)) {
    const response = registryPeers ?? (registry ? { code: 0, output: JSON.stringify({ excudo: peer }) } : await query([`excudo-works@${latest}`, 'peerDependencies']));
    try { peer = JSON.parse(response.output).excudo; if (typeof peer !== 'string' || !/^[\d^~<>=.*| -]+$/.test(peer)) throw new Error(); }
    catch { peerKnown = false; }
  }
  const args = latest && newer(latest, current) && peerKnown ? ['install', '--save-dev', '--save-exact', `excudo-works@${latest}`, ...(!satisfies(engineVersion(ws.root), peer) ? [`excudo@${peer}`] : [])] : [];
  const commands = args.length ? [[npm, ...args].map(value => /^[\w@^./=-]+$/.test(value) ? value : shellQuote(value)).join(' '), 'npx --no-install excudo-works update'] : [];
  const result = { ok: true, current, latest, enginePeer: peer, offline: !latest || !peerKnown, commands, changelog: readFileSync(join(PACKAGE_ROOT, 'CHANGELOG.md'), 'utf8'), releaseNotes: 'https://github.com/cudoment/excudo-works/blob/main/CHANGELOG.md', applied: false };
  if (apply && args.length) {
    const installed = await execute(npm, args, { cwd: ws.root, timeoutMs: 120000, shell: process.platform === 'win32' });
    if (installed.code !== 0) return { ...result, ok: false, detail: 'Package installation failed; retry the printed command.' };
    // Module caching keeps this process on the old release, so the new release refreshes in a fresh
    // process that inherits this run's lock. Fixed interface for every release: the argv below, the
    // environment names, and the JSON result written to the file named by EXCUDO_WORKS_RESULT_FILE.
    const script = join(ws.root, 'node_modules/excudo-works/bin/excudo-works.mjs'), folder = mkdtempSync(join(tmpdir(), 'works-refresh-')), file = join(folder, 'result.json');
    try {
      const refreshed = await launch(process.execPath, [script, 'update', '--refresh-only', '--root', ws.root, ...(force ? ['--force'] : [])], { cwd: ws.root, timeoutMs: 120000, env: { EXCUDO_WORKS_LOCK_TOKEN: lockToken(ws), EXCUDO_WORKS_LOCK_ROOT: ws.root, EXCUDO_WORKS_RESULT_FILE: file } });
      let child; try { child = JSON.parse(readFileSync(file, 'utf8')); } catch {}
      if (refreshed.code !== 0 || !child || typeof child !== 'object' || child.ok === false) return { ...result, ok: false, detail: 'The package is installed but the new release could not refresh this workspace; run npx --no-install excudo-works update.' };
      return { ...result, applied: true, records: child.records, instructions: child.instructions, links: child.links, refreshed: child };
    } finally { rmSync(folder, { recursive: true, force: true }); }
  }
  result.records = migrate(ws).version;
  result.instructions = refreshOwned(ws, { locale: ws.locale, force }); result.links = installSkillLinks(ws);
  return result;
}
