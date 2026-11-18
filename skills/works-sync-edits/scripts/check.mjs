#!/usr/bin/env node
// Usage: node scripts/check.mjs [--json] [--root <folder>] | --facts <file> | --self-test
import { checkMain } from '../../../src/skill-check.mjs';
await checkMain('works-sync-edits', new URL('./check.cases.json', import.meta.url));
