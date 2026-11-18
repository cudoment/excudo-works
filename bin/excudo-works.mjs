#!/usr/bin/env node
// Usage: excudo-works init <folder> [--locale en|ko] | doctor [--json] | run [--manual] [--only <step>] | update [--apply] | feedback
import { packageInfo } from '../src/package-info.mjs';
import { closeImprovement } from '../src/edits.mjs';
import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { initWorkspace, loadConfig, doctor, runPipeline, update, feedback } from '../src/index.mjs';
const help = `excudo-works ${packageInfo().version}
  init <folder> [--locale en|ko] [--force]  Add the routine without replacing user files
  doctor [--json]                        Check setup and print scheduler entries
  run [--manual] [--only <step>]           Execute the daily routine
  update [--apply] [--force]              Check releases, refresh links and migrate records
                                          (--refresh-only skips the registry check; update --apply uses it internally)
  improvements close <id>               Close a completed improvement request
  feedback                              Print an issue draft; never send it
All workspace commands accept --root <folder>. --force replaces only an owned instruction block.`;
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    locale: { type: 'string' }, force: { type: 'boolean' }, root: { type: 'string' }, json: { type: 'boolean' }, manual: { type: 'boolean' }, only: { type: 'string' }, apply: { type: 'boolean' }, 'refresh-only': { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' },
  } });
  const [command, folder, ...extra] = positionals;
  if (values.help || !command || values.version) console.log(values.version ? packageInfo().version : help);
  else {
    if (command !== 'improvements' && (extra.length || (command !== 'init' && folder))) throw new Error('Unexpected positional arguments.');
    let result;
    if (command === 'init') { if (!folder) throw new Error('init needs a folder.'); result = await initWorkspace(folder, values); }
    else if (command === 'doctor') result = await doctor(values.root);
    else {
      const ws = await loadConfig(values.root);
      if (command === 'improvements') { if (folder !== 'close' || extra.length !== 1) throw new Error('Usage: excudo-works improvements close <id>'); result = closeImprovement(ws, extra[0]); }
      else if (command === 'run') result = await runPipeline(ws, values);
      else if (command === 'update') result = await update(ws, values['refresh-only'] ? { ...values, registry: { code: 1, output: '' } } : values);
      else if (command === 'feedback') result = await feedback(ws.root);
      else throw new Error(`Unknown command: ${command}`);
    }
    if (command === 'update' && process.env.EXCUDO_WORKS_RESULT_FILE) writeFileSync(process.env.EXCUDO_WORKS_RESULT_FILE, JSON.stringify(result));
    if (values.json || command === 'init' || command === 'run' || command === 'update') console.log(JSON.stringify(result, null, 2));
    else if (command === 'doctor') {
      console.log(result.checks.map(x => `${x.status.toUpperCase()} ${x.id}: ${x.detail}${x.status !== 'ok' && x.fix ? `\n  Fix: ${x.fix}` : ''}`).join('\n'));
      if (result.scheduler?.enabled) console.log(`\n${result.scheduler.content ?? result.scheduler.command}\n${result.scheduler.instructions}`);
    } else if (command === 'improvements') console.log(JSON.stringify(result));
    else if (command === 'feedback') console.log(`${result.draft}\n${result.url}\n${result.note}`);
    if (result.ok === false) process.exitCode = 1;
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
