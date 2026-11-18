import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadConfig } from '../src/config.mjs';
export async function workspace(t, works = {}) {
  const previous = process.env.EXCUDO_WORKS_ENGINE_SCRIPT;
  process.env.EXCUDO_WORKS_ENGINE_SCRIPT = resolve('test/fixtures/fake-engine.mjs');
  t.after(() => { if (previous === undefined) delete process.env.EXCUDO_WORKS_ENGINE_SCRIPT; else process.env.EXCUDO_WORKS_ENGINE_SCRIPT = previous; });
  const root = mkdtempSync(join(tmpdir(), 'works-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'notes'));
  writeFileSync(join(root, 'excudo.config.mjs'), `export default ${JSON.stringify({ graph: 'notes', works: { principles: false, idle: false, ...works } })}`);
  writeFileSync(join(root, 'AGENTS.md'), '# Owner rules\n');
  return loadConfig(root);
}
