import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, basename, win32 } from 'node:path';
export const shellQuote = text => `'${String(text).replaceAll("'", "'\\''")}'`;
export function sync(command, args, cwd, extra = {}) {
  return spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, ...extra });
}
const cmdQuote = text => `"${String(text).replace(/"/g, '""')}"`;
const whereOutput = command => { const found = spawnSync('where', [command], { encoding: 'utf8', timeout: 5000, windowsHide: true }); return found.status === 0 ? found.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean) : []; };
// Windows cannot spawn an npm .cmd shim without a shell. Resolve a bare command name: use an .exe as
// found, run a shim's node script directly (arguments stay untouched), and only quote for cmd.exe as a last resort.
export function windowsCommand(command, args, { find = whereOutput, read = file => readFileSync(file, 'utf8'), exists = existsSync, node = process.execPath } = {}) {
  const plain = { command, args, shell: false };
  if (/[\\/]/.test(command) || /\.[A-Za-z0-9]+$/.test(command)) return plain;
  let hits; try { hits = find(command); } catch { return plain; }
  const exe = hits.find(file => /\.(?:exe|com)$/i.test(file)); if (exe) return { command: exe, args, shell: false };
  const shim = hits.find(file => /\.(?:cmd|bat)$/i.test(file)); if (!shim) return plain;
  try {
    const script = read(shim).match(/"%(?:~dp0|dp0%)\\([^"]+?\.[cm]?js)"/i)?.[1];
    const path = script && win32.join(win32.dirname(shim), script);
    if (path && exists(path)) return { command: node, args: [path, ...args], shell: false };
  } catch {}
  return { command: cmdQuote(shim), args: args.map(cmdQuote), shell: true };
}
export const npx = () => process.platform === 'win32' ? 'npx.cmd' : 'npx';
export async function runCommand(command, args = [], { cwd, timeoutMs = 120000, shell = false, input, onData = () => {}, signal, env = {} } = {}) {
  if (process.platform === 'win32' && /^(?:npm|npx)(?:\.cmd)?$/i.test(basename(command))) {
    const tool = basename(command).replace(/\.cmd$/i, '').toLowerCase();
    const candidates = [process.env.npm_execpath && join(dirname(process.env.npm_execpath), `${tool}-cli.js`), join(dirname(process.execPath), 'node_modules/npm/bin', `${tool}-cli.js`)];
    const script = candidates.find(file => file && existsSync(file));
    if (!script) return { code: 127, output: 'npm CLI script not found. Install the standard Node distribution with npm.' };
    command = process.execPath; args = [script, ...args]; shell = false;
  } else if (process.platform === 'win32' && !shell) ({ command, args, shell } = windowsCommand(command, args));
  if (signal?.aborted) return { code: 130, output: '', aborted: true };
  return new Promise(resolve => {
    const grouped = process.platform !== 'win32' && process.env.EXCUDO_WORKS_NESTED !== '1';
    const child = spawn(command, args, { cwd, shell, detached: grouped, windowsHide: true, env: { ...process.env, ...env, EXCUDO_WORKS_NESTED: '1' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', stdout = '', stderr = '', timedOut = false, aborted = false, cleanup, settled = false;
    const capture = (data, stream = 'stderr') => { output = (output + data).slice(-1024 * 1024); if (stream === 'stdout') stdout = (stdout + data).slice(-1024 * 1024); else stderr = (stderr + data).slice(-1024 * 1024); onData(String(data)); };
    child.stdout.on('data', data => capture(data, 'stdout')); child.stderr.on('data', data => capture(data));
    child.stdin.on('error', () => {}); child.stdin.end(input);
    const stop = () => new Promise(done => {
      if (!child.pid) return done();
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        killer.once('error', () => { child.kill(); done(); }); killer.once('close', done);
      } else {
        const descendants = () => {
          const table = spawnSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8', timeout: 3000 });
          const pairs = (table.stdout ?? '').trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
          const found = new Set([child.pid]); let changed = true;
          while (changed) { changed = false; for (const [pid, parent] of pairs) if (found.has(parent) && !found.has(pid)) { found.add(pid); changed = true; } }
          return [...found].reverse();
        };
        const pids = grouped ? [] : descendants();
        const kill = signal => {
          if (grouped) { try { process.kill(-child.pid, signal); } catch {} }
          else for (const pid of new Set([...pids, ...descendants()])) { try { process.kill(pid, signal); } catch {} }
        };
        kill('SIGTERM'); setTimeout(() => { kill('SIGKILL'); done(); }, 200);
      }
    });
    const timer = setTimeout(() => { timedOut = true; cleanup = stop(); }, timeoutMs);
    const abort = () => { aborted = true; cleanup = stop(); };
    signal?.addEventListener('abort', abort, { once: true });
    const finish = async code => {
      if (settled) return; settled = true;
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (cleanup) await cleanup;
      resolve({ code: timedOut ? 124 : aborted ? 130 : code ?? 1, output: code === 0 && !timedOut && !aborted ? stdout : output, stderr, timedOut, aborted });
    };
    child.on('error', error => { capture(error.message); finish(127); });
    child.on('close', finish);
  });
}
export const engineRun = (root, args, options = {}) => process.env.EXCUDO_WORKS_ENGINE_SCRIPT
  ? runCommand(process.execPath, [process.env.EXCUDO_WORKS_ENGINE_SCRIPT, ...args], { cwd: root, ...options })
  : runCommand(npx(), ['--no-install', 'excudo', ...args], { cwd: root, shell: process.platform === 'win32', ...options });
