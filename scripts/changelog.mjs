#!/usr/bin/env node
// Usage: node scripts/changelog.mjs [--check]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const entries = readdirSync(join(root, 'changes')).filter(x => x.endsWith('.json')).sort((a, b) => b.localeCompare(a, 'en', { numeric: true })).map(file => JSON.parse(readFileSync(join(root, 'changes', file))));
const content = '# Changelog\n\nChanges are grouped by released package version.\n\n' + entries.map(entry => `## ${entry.version} - ${entry.date}\n\nThis release includes the following changes.\n\n${entry.changes.map(text => `- ${text}`).join('\n')}\n`).join('\n');
if (process.argv.includes('--check')) process.exitCode = readFileSync(join(root, 'CHANGELOG.md'), 'utf8') === content ? 0 : 1;
else writeFileSync(join(root, 'CHANGELOG.md'), content);
