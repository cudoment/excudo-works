#!/usr/bin/env node
// Usage: node test/fixtures/fake-engine.mjs <engine arguments...>
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2), root = process.cwd(), config = (await import(pathToFileURL(join(root, 'excudo.config.mjs')).href)).default;
const file = join(root, 'fake-engine.json');
const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
const log = join(root, '.fake-engine-calls'); appendFileSync(log, JSON.stringify(args) + '\n');
if (args[0] === 'idle') {
  const status = spawnSync('git', ['status', '--porcelain', '--', config.graph ?? 'notes'], { cwd: root, encoding: 'utf8' });
  const idleCount = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse).filter(call => call[0] === 'idle').length;
  const busy = state.busy || state.busyAfterIdle && idleCount > state.busyAfterIdle || state.checkDirty && status.stdout.trim(); console.log(JSON.stringify({ state: busy ? 'busy' : 'idle' })); process.exitCode = busy ? 1 : 0;
} else if (args[0] === 'instructions') console.log(JSON.stringify(state.instructions ?? { over: false, bytes: 100, limit: config.instructions?.limit ?? 32768 }));
else if (args[0] === 'save' && state.saveFail) { console.error('Graph check failed.'); process.exitCode = 1; }
else if (args[0] === 'save') {
  const paths = args.flatMap((value, index) => value === '--only' ? [args[index + 1]] : []);
  spawnSync('git', ['add', '--', ...paths], { cwd: root });
  const result = spawnSync('git', ['-c', 'user.name=Fixture Owner', '-c', 'user.email=fixture.invalid', 'commit', '--only', '-m', 'Apply fixture edits', '--', ...paths], { cwd: root });
  process.exitCode = result.status;
} else if (args[0] === 'workspaces') console.log(JSON.stringify({ names: (state.folders ?? []).map(path => ({ path })) }));
else if (args[0] === 'activity' && !config.conversations) { console.error('Conversation collection is disabled.'); process.exitCode = 1; }
else if (args[0] === 'backup') { mkdirSync(args[1], { recursive: true }); console.log('Cache copied.'); }
else console.log('{}');
