#!/usr/bin/env node
// Usage: node src/step.mjs <built-in-step> <workspace>
import { loadConfig } from './config.mjs';
import { withWorkspaceLock } from './lock.mjs';
import { builtIn } from './pipeline.mjs';
try {
  const [id, root, timeout, manual] = process.argv.slice(2);
  const ws = await loadConfig(root);
  const result = await withWorkspaceLock(ws, () => builtIn(ws, id, { timeoutMs: Number(timeout) || ws.config.timeoutMs, manual: manual === 'true' }));
  if (result.output) console.log(result.output);
  process.exitCode = result.code;
} catch (error) { console.error(error.message); process.exitCode = 1; }
