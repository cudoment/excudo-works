#!/usr/bin/env node
// Usage: node scripts/run.mjs [--scheduled]
import { skillRun } from '../../../src/skill-run.mjs';
await skillRun('works-daily');
