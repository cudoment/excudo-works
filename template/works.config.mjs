export default {
  // Add { id: 'name', command: ['node', 'automation/check.mjs'] }
  // or { id: 'name', script: 'automation/check.mjs' } to steps.
  // A built-in id replaces that step; new steps run before report.
  steps: [],
  disabled: [],
  timeoutMs: 120000,
  agentTimeoutMs: 1200000,
  manualWindowMinutes: 60,
  report: { file: 'weekly.md', days: 7 },
  policy: 'policy.json',
  principles: true,
  invariants: 'invariants.json',
  review: false,
  backup: false,
  home: false,
  scheduler: false,
  notifications: false,
};
