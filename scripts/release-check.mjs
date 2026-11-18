#!/usr/bin/env node
// Usage: node scripts/release-check.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { sync, runCommand } from '../src/process.mjs';
import { scan } from './denylist.mjs';
export function registryProblems(manifest, lock) {
  const problems = [];
  const registrySpec = spec => typeof spec === 'string' && /^(?:[~^<>=*v\d]|[a-z][a-z\d-]*$|npm:)/i.test(spec) && (!/[\\/:]/.test(spec) || spec.startsWith('npm:')) && !/(?:file:|link:|workspace:|https?:|git\+|github:|gitlab:|^\.\.?[\\/]|^[\\/]|^~[\\/])/.test(spec);
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) for (const [name, spec] of Object.entries(manifest[field] ?? {})) if (!registrySpec(spec)) problems.push(`${field}.${name} must use a registry version.`);
  for (const [name, entry] of Object.entries(lock?.packages ?? {})) {
    if (entry.link || entry.resolved && !/^https:\/\/registry\.npmjs\.org\//.test(entry.resolved)) problems.push(`Lock entry ${name} is not a registry package.`);
  }
  return problems;
}
export function publicInventory(output) {
  try {
    const data = JSON.parse(output);
    const entries = (Array.isArray(data) ? data[0] : Object.values(data)[0]).files;
    return Array.isArray(entries) && entries.length > 0 && entries.every(file => typeof file.path === 'string' && !/^(?:private|node_modules|\.excudo|test)\//.test(file.path));
  } catch { return false; }
}
export function metadataProblems(manifest, changelog) {
  const problems = [];
  if (manifest.name !== 'excudo-works' || !/^\d+\.\d+\.\d+$/.test(manifest.version ?? '')) problems.push('Invalid package identity or version.');
  if (!changelog.includes(`## ${manifest.version} -`)) problems.push('Package version is missing from the generated changelog.');
  if (typeof manifest.peerDependencies?.excudo !== 'string') problems.push('Engine peer range is missing.');
  return problems;
}
export async function releaseCheck(root) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json')));
  const lock = existsSync(join(root, 'package-lock.json')) ? JSON.parse(readFileSync(join(root, 'package-lock.json'))) : undefined;
  const checks = [], add = (id, ok, detail) => checks.push({ id, ok, detail });
  const status = sync('git', ['status', '--porcelain'], root);
  add('committed', status.status === 0 && !status.stdout.trim(), 'Commit every intended change before release.');
  const metadata = metadataProblems(manifest, readFileSync(join(root, 'CHANGELOG.md'), 'utf8'));
  add('metadata', metadata.length === 0, metadata.join(' ') || 'Package metadata and changelog agree.');
  const cliVersion = sync(process.execPath, ['bin/excudo-works.mjs', '--version'], root);
  add('cli-version', cliVersion.status === 0 && cliVersion.stdout.trim() === manifest.version, 'CLI version must match package.json.');
  const deps = registryProblems(manifest, lock); add('registry', deps.length === 0, deps.join(' ') || 'Dependencies use registry versions.');
  const privacy = scan(root); add('denylist', privacy.ok, privacy.ok ? 'Private-list scan passed.' : 'Restricted content was found; run npm run denylist.');
  const changelog = sync(process.execPath, ['scripts/changelog.mjs', '--check'], root); add('changelog', changelog.status === 0, 'Generated changelog must be current.');
  if (checks.every(x => x.ok)) {
    const tests = await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], { cwd: root, timeoutMs: 300000, shell: process.platform === 'win32' });
    add('tests', tests.code === 0, tests.code === 0 ? 'Tests passed.' : tests.output.slice(-2000));
    const pack = await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--dry-run', '--json'], { cwd: root, timeoutMs: 30000, shell: process.platform === 'win32' });
    const safe = publicInventory(pack.output);
    add('package', pack.code === 0 && safe, 'Package must contain only the declared public product files.');
  }
  return { ok: checks.every(x => x.ok), checks };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = await releaseCheck(fileURLToPath(new URL('..', import.meta.url))); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ok ? 0 : 1; }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
