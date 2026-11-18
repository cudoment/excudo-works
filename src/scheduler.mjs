import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { sync, shellQuote } from './process.mjs';
export function scheduleInfo(ws, platform = process.platform) {
  const label = `excudo-works.${createHash('sha256').update(ws.root).digest('hex').slice(0, 12)}`;
  const hour = ws.config.scheduler?.hour ?? 9, minute = ws.config.scheduler?.minute ?? 0;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error('scheduler hour/minute must be valid local times.');
  const bin = join(ws.root, 'node_modules/excudo-works/bin/excudo-works.mjs');
  const command = `PATH=${shellQuote(process.env.PATH ?? '/usr/bin:/bin')} ${shellQuote(process.execPath)} ${shellQuote(bin)} run --root ${shellQuote(ws.root)}`;
  if (platform === 'darwin') {
    const file = join(homedir(), 'Library/LaunchAgents', `${label}.plist`);
    const xml = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    const content = `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${[process.execPath, bin, 'run', '--root', ws.root].map(x => `<string>${xml(x)}</string>`).join('')}</array><key>WorkingDirectory</key><string>${xml(ws.root)}</string><key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(process.env.PATH ?? '/usr/bin:/bin')}</string></dict><key>StartCalendarInterval</key><dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer></dict></dict></plist>\n`;
    const registered = sync('launchctl', ['print', `gui/${process.getuid?.() ?? 0}/${label}`], ws.root).status === 0;
    const matches = existsSync(file) && readFileSync(file, 'utf8') === content;
    return { enabled: Boolean(ws.config.scheduler), registered: registered && matches, label, file, content, instructions: `Save the plist above as ${file}, then run: launchctl bootstrap gui/$(id -u) ${shellQuote(file)}` };
  }
  if (platform === 'win32') {
    const query = sync('schtasks', ['/Query', '/TN', label, '/XML'], ws.root);
    const registered = query.status === 0 && query.stdout.includes('excudo-works.mjs') && query.stdout.includes(ws.root);
    return { enabled: Boolean(ws.config.scheduler), registered, label, command: `schtasks /Create /TN "${label}" /SC DAILY /ST ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} /TR "\\\"${process.execPath}\\\" \\\"${bin}\\\" run --root \\\"${ws.root}\\\""`, instructions: 'Run this in a terminal to register a daily Task Scheduler entry; preserve the existing task if it differs.' };
  }
  const content = `${minute} ${hour} * * * ${command.replaceAll('%', '\\%')} # ${label}`;
  const table = sync('crontab', ['-l'], ws.root);
  return { enabled: Boolean(ws.config.scheduler), registered: table.status === 0 && table.stdout.split('\n').includes(content), label, content, instructions: 'Add this line with crontab -e. Keep existing jobs. The scheduler uses the operating system local time.' };
}
