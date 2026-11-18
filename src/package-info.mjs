import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
export const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const packageInfo = (root = PACKAGE_ROOT) => JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const tuple = value => /^\d+\.\d+\.\d+$/.test(value ?? '') ? value.split('.').map(Number) : null;
const compare = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return Math.sign(a[i] - b[i]); return 0; };
export function satisfies(version, range) {
  const current = tuple(version); if (!current || typeof range !== 'string') return false;
  return range.split('||').some(part => {
    const text = part.trim(); if (text === '*' || text === 'latest') return true;
    return text.split(/\s+/).every(token => {
      const match = token.match(/^(\^|~|>=|<=|>|<|=)?(\d+)\.(\d+)\.(\d+)$/); if (!match) return false;
      const base = match.slice(2).map(Number), delta = compare(current, base), op = match[1] ?? '=';
      if (op === '^') { const upper = base[0] ? [base[0] + 1, 0, 0] : base[1] ? [0, base[1] + 1, 0] : [0, 0, base[2] + 1]; return delta >= 0 && compare(current, upper) < 0; }
      if (op === '~') return delta >= 0 && compare(current, [base[0], base[1] + 1, 0]) < 0;
      return op === '>=' ? delta >= 0 : op === '<=' ? delta <= 0 : op === '>' ? delta > 0 : op === '<' ? delta < 0 : delta === 0;
    });
  });
}
