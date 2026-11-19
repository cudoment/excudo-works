#!/usr/bin/env node
// Usage: node scripts/install-test.mjs [--engine <engine checkout> | --engine-version <range>]
// Installs the packed kit the way the README agent sequence does, for each locale, in temporary folders. Needs the network.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const LOCALES = ['en', 'ko'];
const REQUIRED_STEPS = ['workspace', 'install', 'git', 'skills'];
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

export function parseArgs(argv) {
  const options = { engine: undefined, engineVersion: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--engine' || arg === '--engine-version') {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value.`);
      options[arg === '--engine' ? 'engine' : 'engineVersion'] = value;
    } else throw new Error(`Unknown argument ${arg}. Use --engine <path> or --engine-version <range>.`);
  }
  if (options.engine && options.engineVersion) throw new Error('Use --engine or --engine-version, not both.');
  return options;
}

export function reportSteps(output) {
  const start = output.indexOf('{');
  if (start < 0) return undefined;
  try {
    const report = JSON.parse(output.slice(start));
    const steps = report.steps ?? report.report?.steps;
    return Array.isArray(steps) ? steps : undefined;
  } catch { return undefined; }
}

export function stepProblems(output) {
  const steps = reportSteps(output);
  if (!steps) return ['The start report is not JSON with a steps list.'];
  return REQUIRED_STEPS.flatMap(id => {
    const step = steps.find(item => item.id === id);
    return step?.state === 'done' ? [] : [`step ${id} is ${step?.state ?? 'missing'}`];
  });
}

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 600000, shell: process.platform === 'win32' });
  return { code: result.status ?? 1, stdout: result.stdout ?? '', output: `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? String(result.error) : ''}` };
}

function pack(dir, destination, env) {
  // Lifecycle scripts may print before npm's own output, so find the new tarball in the destination instead of parsing stdout.
  const before = new Set(readdirSync(destination));
  const result = run(npm, ['pack', '--pack-destination', destination], dir, env);
  const created = readdirSync(destination).filter(file => file.endsWith('.tgz') && !before.has(file));
  if (result.code !== 0 || created.length !== 1) throw new Error(`npm pack failed in ${dir}:\n${result.output.slice(-1500)}`);
  return join(destination, created[0]);
}

export async function installTest(options = {}) {
  const base = mkdtempSync(join(tmpdir(), 'excudo-works-install-'));
  const env = { ...process.env, npm_config_cache: join(base, 'npm-cache'), npm_config_update_notifier: 'false', npm_config_fund: 'false', npm_config_audit: 'false', GIT_CONFIG_GLOBAL: join(base, 'gitconfig'), GIT_CONFIG_SYSTEM: process.platform === 'win32' ? 'NUL' : '/dev/null' };
  const manifest = JSON.parse(readFileSync(join(KIT_ROOT, 'package.json'), 'utf8'));
  const rows = [];
  const record = (name, ok, detail = '') => { rows.push({ name, ok, detail }); return ok; };
  try {
    const tarballs = join(base, 'tarballs'); mkdirSync(tarballs);
    const kitTgz = pack(KIT_ROOT, tarballs, env);
    const engineTgz = options.engine ? pack(resolve(options.engine), tarballs, env) : undefined;
    const engineSpec = engineTgz ?? `excudo@${options.engineVersion ?? manifest.peerDependencies.excudo}`;
    record('pack', true, [kitTgz, engineTgz].filter(Boolean).map(file => file.slice(tarballs.length + 1)).join(', '));
    for (const locale of LOCALES) {
      const dir = join(base, `work-${locale}`); mkdirSync(dir);
      const ws = join(dir, 'my-work');
      const steps = [
        ['engine init', () => run(npx, ['-y', '--package', engineSpec, 'excudo', 'init', 'my-work', '--locale', locale], dir, env)],
        ['npm install', () => engineTgz ? run(npm, ['install', '--save-dev', engineTgz], ws, env) : run(npm, ['install'], ws, env)],
        ['git init', () => {
          const init = run('git', ['init'], ws, env);
          if (init.code !== 0) return init;
          return run('git', ['config', 'user.email', 'install-test@example.invalid'], ws, env).code === 0 && run('git', ['config', 'user.name', 'Install Test'], ws, env).code === 0 ? init : { code: 1, output: 'git config failed' };
        }],
        ['start --report', () => {
          const result = run(npx, ['--no-install', 'excudo', 'start', '--report', '--json'], ws, env);
          const problems = stepProblems(result.stdout);
          return problems.length ? { code: 1, output: `${problems.join('; ')}\n${result.output.slice(-1500)}` } : result;
        }],
        ['install kit', () => run(npm, ['install', '--save-dev', kitTgz], ws, env)],
        ['kit init', () => run(npx, ['--no-install', 'excudo-works', 'init', '.', '--locale', locale], ws, env)],
        ['doctor', () => run(npx, ['--no-install', 'excudo-works', 'doctor'], ws, env)],
        ['run report', () => {
          const result = run(npx, ['--no-install', 'excudo-works', 'run', '--manual', '--only', 'report'], ws, env);
          return result.code === 0 && !existsSync(join(ws, 'weekly.md')) ? { code: 1, output: 'weekly.md was not created.' } : result;
        }],
        ['excudo check', () => run(npx, ['--no-install', 'excudo', 'check'], ws, env)],
      ];
      let failed = false;
      for (const [name, action] of steps) {
        if (failed) { record(`${locale}: ${name}`, false, 'skipped'); continue; }
        const result = action();
        failed = !record(`${locale}: ${name}`, result.code === 0, result.code === 0 ? '' : result.output.slice(-600).trim());
      }
      if (!failed) {
        const result = run(npx, ['--no-install', 'excudo-works', 'init', '.', '--locale', 'ja'], ws, env);
        const refused = result.code !== 0 && /use en/i.test(result.output);
        record(`${locale}: init --locale ja fails with "use en"`, refused, refused ? '' : result.output.slice(-600).trim());
      }
    }
  } catch (error) { record('setup', false, error.message); }
  const ok = rows.every(row => row.ok);
  if (ok) rmSync(base, { recursive: true, force: true });
  return { ok, rows, base };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let options;
  try { options = parseArgs(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exit(2); }
  const result = await installTest(options);
  for (const row of result.rows) console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${row.name}${row.detail && !row.ok ? `\n      ${row.detail.replaceAll('\n', '\n      ')}` : row.detail ? `  (${row.detail})` : ''}`);
  console.log(result.ok ? '\nInstall test passed; the temporary folder was removed.' : `\nInstall test failed; the temporary folder is kept at ${result.base}`);
  process.exitCode = result.ok ? 0 : 1;
}
