#!/usr/bin/env node
// Usage: node scripts/run.mjs [--scheduled] [restore <archive> <new-folder>]
import { skillRun } from '../../../src/skill-run.mjs';
await skillRun('works-backup');
