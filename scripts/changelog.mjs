#!/usr/bin/env node
// Usage: node scripts/changelog.mjs [--check]
// A change written as "Area!: Summary" needs an action from the owner; it is listed first under "Owner action".
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
export const OWNER_ACTION = /^([A-Z][A-Za-z0-9]*(?: [A-Z][A-Za-z0-9]*){0,2})!:\s+(\S.*)$/;
export function splitChanges(changes) {
  const owner = [], other = [];
  for (const text of changes) { const match = OWNER_ACTION.exec(text); if (match) owner.push(`${match[1]}: ${match[2]}`); else other.push(text); }
  return { owner, other };
}
export function renderEntry(entry) {
  const { owner, other } = splitChanges(entry.changes), list = items => items.map(text => `- ${text}`).join('\n');
  const body = owner.length ? `### Owner action\n\n${list(owner)}\n${other.length ? `\n### Other changes\n\n${list(other)}\n` : ''}` : `${list(other)}\n`;
  return `## ${entry.version} - ${entry.date}\n\nThis release includes the following changes.\n\n${body}`;
}
export function render(entries) { return '# Changelog\n\nChanges are grouped by released package version.\n\n' + entries.map(renderEntry).join('\n'); }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const entries = readdirSync(join(root, 'changes')).filter(x => x.endsWith('.json')).sort((a, b) => b.localeCompare(a, 'en', { numeric: true })).map(file => JSON.parse(readFileSync(join(root, 'changes', file))));
  const content = render(entries);
  if (process.argv.includes('--check')) process.exitCode = readFileSync(join(root, 'CHANGELOG.md'), 'utf8') === content ? 0 : 1;
  else writeFileSync(join(root, 'CHANGELOG.md'), content);
}
