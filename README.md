# excudo-works

English | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

Turn an Excudo workspace into a daily automation routine, with reports you can edit and decisions you control.
The kit works with ordinary files and command-line agents on macOS, Linux and Windows.
It requires Node 22.16 or later and Excudo `^0.8.0`.

## Start

Create the workspace with the engine first, then add the kit inside it. Nothing is installed in the folder you start from.

```sh
npx -y excudo@^0.8.0 init my-work --locale en
cd my-work
npm install
git init
npx --no-install excudo start --report --json
npm install --save-dev excudo-works@^0.2.0
npx --no-install excudo-works init . --locale en
npx --no-install excudo-works doctor
npx --no-install excudo-works run --manual --only report
```

`init` calls the locally available engine to initialize a new workspace.
With no engine found, it prints the same commands as above in order (`npx -y excudo@<range> init <folder> --locale <l>`, `cd <folder>`, `npm install`, `git init`, `npx --no-install excudo start --report --json`, `npm install --save-dev excudo-works@^<version>`, `npx --no-install excudo-works init . --locale <l>`) and leaves no folder behind.
If an engine is found but its initialization fails, it prints the last 2000 characters of the engine output and no install commands.
Run the printed install commands before using the linked skills.

If `doctor` shows an `activity` warning, turn on `conversations` in `excudo.config.mjs`.
The engine then reads your requests to coding agents, learns from them and creates skills.

Existing configuration, policy and user skill folders are preserved.

Choose the worker and reviewers with `npx --no-install excudo agents` before a complete routine.
On Windows the kit resolves `claude` and `codex` through `where`, so npm `.cmd` installs run; `doctor` warns when a worker CLI is missing.
The engine owns memo capture, source handling and reflection.
It also owns skill upkeep, task queues, mirrors and agent preferences.

This kit calls engine commands or installed engine skills; it supplies the routine around them.

## Install with a coding agent

Paste this sentence into your coding agent:

> Set up Excudo Works from https://github.com/cudoment/excudo-works in a new folder, following its README section "Install with a coding agent"

The agent follows these rules:

- Require Node 22.16 or later (https://nodejs.org) and stop with that link if it is older.
- Ask once for the folder name and the language of the files and memo (`en` or `ko`). Use `ko` only if the owner reads Korean; otherwise use `en`. Use the folder name in place of `my-work` and that language in place of both `--locale` values; change nothing else.
- Keep talking to the owner in the owner's own language (Japanese, Chinese or any other), whichever `--locale` value the files use.
- Install nothing globally; use only `npx -y` and project-local `npm install`.
- Run the first command from "Start", `npx -y excudo@^0.8.0 init my-work --locale en`. Resolve the full path of the new folder once after `init` (for example the current folder plus `my-work`). Run every command after it inside that folder, in two lines. Each line starts with `cd <absolute folder path>`, with the full path in place of the placeholder, so it works whatever folder the shell is in.
- Line 1 installs the engine and reports its state; `init` does not run git, so `git init` is part of it:
  `cd <absolute folder path> && npm install && git init && npx --no-install excudo start --report --json`
- Read the report. It shows the steps `workspace`, `install`, `git` and `skills`; each must be `done`. `start --report` exits 0 either way, so check the steps yourself. If one is not `done`, stop, show its `id` and `state` and ask the owner. Do not run line 2.
- Only when all four are `done`, run line 2, which installs the kit:
  `cd <absolute folder path> && npm install --save-dev excudo-works@^0.2.0 && npx --no-install excudo-works init . --locale en && npx --no-install excudo-works doctor && npx --no-install excudo-works run --manual --only report`
- The setup is verified when the four report steps are `done` and `doctor` passes.
- On a failed command, stop and show the tail of the error output instead of guessing a fix.
- Tell the owner the next step: open the generated `weekly.md` and handle any `doctor` warning, such as `activity`.

## Commands

Run workspace commands from the workspace or pass `--root <folder>`.

| Command | Result |
| --- | --- |
| `init <folder> [--locale en\|ko]` | Create missing kit files and skill links |
| `doctor [--json]` | Check setup and print fixes and optional scheduler entries |
| `run [--manual] [--only <step>]` | Execute the routine and write a final backlog |
| `update [--apply]` | Check the registry, show installed release notes and exact update commands |
| `improvements close <id>` | Close a completed improvement request |
| `feedback` | Print a local issue draft and an issue-creation link |

Instruction text lives between `excudo-works:start` and `excudo-works:end` comments in AGENTS.md and CLAUDE.md.
A changed owned block is preserved until you review it and supply `--force` to `init` or `update`.
That flag affects only the owned instruction block.

Owner principles sit outside it and are never refreshed by an update.

`update` migrates each kit state file and refreshes links.
This includes edits, report snapshots and installation metadata.
It also migrates review and backup receipts, policy and invariants.

Local refresh still works when the registry is offline.
`--apply` runs the printed package installation, then starts the new release in a fresh process to refresh links and migrate records under the same run lock.
If that refresh fails, rerun `npx --no-install excudo-works update`.
Registry failure is reported as offline and does not fail the command.

A new release's engine peer range is checked, and its engine installation is included when needed.
Dropped kit-owned skill links are removed; changed user links are preserved.
Remote release notes are linked; the printed changelog belongs to the installed release.
Changes that need your action are listed first, under "Owner action", in the changelog and in the `ownerActions` field that `update` prints first, a list of `{ version, items }` with the newest release first; after `--apply` it covers every release since the previous one.
The workspace records the kit version at `init` and `update`, so a plain `update` after a manual upgrade also lists the releases you skipped.

`feedback` includes the engine feedback output when supported and a kit diagnostic summary.
Older engines get a diagnostic fallback and a version warning.
The issue URL contains no diagnostic output; review the local draft before sharing it.

Nothing is posted automatically.

## Configure the routine

Put kit settings in `works` inside `excudo.config.mjs`, or export them from `works.config.mjs`.
A separate works configuration takes precedence as a whole.

```js
export default {
  timezone: 'UTC',
  timeoutMs: 120000,
  agentTimeoutMs: 1200000,
  manualWindowMinutes: 60,
  disabled: [],
  steps: [
    { id: 'review-local-files', script: 'automation/check-files.mjs', timeoutMs: 30000 },
    { id: 'custom-summary', command: ['node', 'automation/summary.mjs'], daily: false },
  ],
  report: { file: 'weekly.md', days: 7, keepBackups: 5 },
  policy: 'policy.json',
  principles: true,
  invariants: 'invariants.json',
  review: false,
  backup: false,
  home: false,
  scheduler: false,
  notifications: false,
}
```

`report.keepBackups` limits the `report-before-<hash>.md` copies kept under `.excudo/works`; the newest stay.

The routine starts with sources, edits and reflect.
It then runs skills, queue and report.
Sources and reflect use the engine-configured worker and the engine's installed skills.

Skills upkeep and queue listing call the engine directly.

Queue execution is a separate owner-authorized action; the default routine only lists it.
A missing worker defers its steps and prints the fix.
Worker steps default to 20 minutes; a step's `timeoutMs` reaches both the step runner and its worker.

Other steps default to two minutes.

A custom step with a built-in id overrides only the fields it sets, so `{ id: 'report', timeoutMs: 300000 }` keeps `daily: false`.
Other custom steps run before report.
`command` accepts an argv array or an intentional shell command string; `script` runs a Node file.
Prefer arrays when arguments contain paths or untrusted text.

Use `enabled: false` on a custom step or list its id under `disabled` to turn it off.

Successful steps skip further scheduled calls on the same local day unless `daily: false`.
Edits, queue and report default to `daily: false` so new edits and decisions appear on each run.
Manual runs bypass that skip.

Only a completely successful full manual run suppresses the next scheduled run within `manualWindowMinutes`.
Partial, deferred, failed and interrupted manual runs do not create that suppression marker.

The kit follows the engine `cache` setting; `.excudo` below is its default.
Each run holds `.excudo/works/run.lock` and writes `.excudo/logs/works-<date>.log`.
Timeouts stop the child process tree; exit code 75 records a deferred step and 124 records a timeout.

All state-writing entry points, including individual skills, share this lock.
A dead process on the same host is recovered automatically.
A live or unknown owner keeps the lock; inspect its record before manual recovery.

Each completed step also uses `excudo runs add` so Home can display it.
Run details remain in `.excudo/works/records.json`; the final backlog is `.excudo/reports/works-backlog.md`.

Scheduled memo-changing steps consult `excudo idle` before they run.
Active edits, a held graph lock or an owner pause line defer those steps.
Manual execution expresses the owner's request and still preserves source conflicts.

Kit memo writes hold the engine graph lock and scheduled writes require its idle gate.
Report rendering only collects pending edits; it never applies them to memo sources.
An individual scheduled skill invocation must append `--scheduled`.

Custom steps inherit the routine's scheduled or manual context.
Engine skills may save their work under the engine workspace rules.

After applying report edits or judged task changes, the kit saves exactly its written memo files with `excudo save --only`.
If the save fails, the files appear under "To check" and the next edits step saves them again.
This creates a focused commit in Git workspaces and prevents the kit from blocking its later idle checks.
Pushing, publishing and messaging still require owner authorization.


The worker permission profile is configurable in `workerPermissions` and printed by doctor.
Claude defaults to `acceptEdits` and a fixed set of file tools.
Its allowed list is `Read,Write,Edit,Glob,Grep,Bash(npx --no-install excudo:*)`.

Codex defaults to the `workspace-write` sandbox.
Read-only judgment and review use stricter profiles; Claude JSON error results count as failures.

```js
workerPermissions: {
  claude: {
    mode: 'acceptEdits',
    allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash(npx --no-install excudo:*)'],
  },
  codex: { sandbox: 'workspace-write' },
}
```

The improvement skill prints an interactive command with its own `improvePermissions` profile.
The profile adds branching, staging, commits and test commands (`git switch`, `git status`, `git diff`, `git add`, `git commit`, `npm test`) but never `git push`.
You run that command yourself, so each approval stays visible and nothing runs without you.
The command is quoted for a POSIX shell, or for PowerShell on Windows; `improvement-plan.json` also keeps the plain `argv` array and the `shell` it targets.

## Edit reports and answer questions

Edit a task title or status inside the generated report and leave its task marker intact.
The next edits step compares the report with its last generated snapshot.
A matching source and a permitted policy allow a task edit; source conflicts remain decisions.

Removed or reformatted task lines are preserved for review rather than deleting memo tasks.

`policy.json` defaults to automatic title and non-completion status edits, with completion requiring review.
Set `allowCompletion: true` only if explicit report completion edits should mark matching memo tasks DONE.
For a pending title/status decision, add ` // apply` to its question to authorize that edit once.

Approval checks the source line and location saved when the request was made.
A concurrent source change still prevents automatic application.
Task source backups and complete edited reports stay under `.excudo/works/`.

Add ` // your answer` to a report line to record a natural language comment.
The configured worker judges new comments read-only against the policy and current task snapshot.
Only validated title/status edits apply; ambiguity, source conflicts and protected completions remain owner decisions.

Set `comments: "ask"` to collect all comments for manual judgment.

Use ` // improve: requested behavior` for a code request; it becomes a separate improvement request.
Items progress through open, answered and closed states.
Use ` // done` or ` // dismiss` on a question to close it; Korean answers include `완료`, `적용` and `무시`.

Settled answers close the original question.
Close finished code requests with `npx --no-install excudo-works improvements close <id>`.

Report content outside the generated markers is preserved verbatim.
A missing or duplicate marker stops generation.
If the report changes during collection or rendering, generation aborts for a retry.

Snapshots preserve other direct edits inside the generated area, even if those edits cannot be applied automatically.
Move lasting owner notes outside the generated markers.

## Weekly reporting and review

The weekly report groups memo tasks into DONE, DOING and WAITING, followed by engine activity and "To check".
DONE tasks use a CLOSED/completed date when present, otherwise the source file modification time.
The "Activity" section includes engine Git and agent activity when `conversations` is enabled.

When it is off, the kit reads recent Git commits from the engine's work folders.
Like the engine, it lists only commits by each repository's `user.email`, skips merges, counts a repository once across worktrees and hides subjects that look private.
Doctor reports this prerequisite; no tracker is required.
Undated old completions in recently edited files need owner review before using the report externally.

Set `report.adapter` to a workspace-relative JavaScript module to add tracker links or other report lines.
Its default export receives `{ root, tasks }` and returns an array of strings.
The adapter is trusted workspace code and runs locally.

Owner principles live between `works:principles:start` and `works:principles:end` in AGENTS.md.
The same text must appear in `invariants.json` as `{ "version": 1, "text": "..." }`.
Change both only after the owner approves a principles change.

A mismatch stops the routine.
Instruction health uses `excudo instructions --check --json` and the engine's `instructions.limit`.
An overrun becomes a backlog warning so cleanup steps can still run.

Enable `review: { days: 7, commits: 1 }` to add weekly read-only cross review.
It uses `agents.reviewers` from the engine and writes `.excudo/reports/works-review.md`.
A diff above `review.maxDiffBytes` (default 200000) is capped as a whole: half for the change summary, the rest for the start of the patch, and the review file lists what was omitted.
Failed reviewers leave the successful review marker unchanged; review findings never apply themselves.

The improvement skill prints worker and fast-forward merge commands for owner review, without launching workers or merging.

## Optional integrations

Enable only the integrations that fit your workspace.

| Setting | Behavior |
| --- | --- |
| `scheduler: { hour: 9, minute: 0 }` | Doctor prints a launchd plist, cron entry or Task Scheduler command |
| `notifications: { command: ['notify-tool'] }` | Pass a result summary as JSON on stdin to your command |
| `home: { file: 'notes/views/Home.mdx', personal: 'Personal plans', work: 'Work' }` | Read-only two-area Home layout check |
| `orca: true` | Check optional editor integration availability |

Scheduler registration is manual and uses the operating system local time.
Doctor checks whether an existing registration matches the workspace entry.
Keep other scheduled jobs when installing the entry.

The engine's website inbox schedule remains separate from this daily routine.

Home belongs to the owner.
The Home skill checks personal plans above work queries and supports comparison with the original work area.
The routine never rearranges Home automatically.

## Encrypted backup

Set an archive folder and a password source before running the backup skill.

```js
backup: {
  folder: '../encrypted-archives',
  passwordEnv: 'WORKS_BACKUP_PASSPHRASE',
  maxBytes: 134217728,
  keep: 30,
}
```

Choose `keychainService` on macOS, `secretService` on Linux or `credentialName` on Windows for unattended backup.
Linux needs the `secret-tool` command and an unlocked Secret Service session.
Windows reads a Generic Credential from the current user's Credential Manager using the bundled PowerShell helper.
The helper runs with a process-scoped `-ExecutionPolicy Bypass`, so the default Restricted policy does not block it and system settings stay unchanged.
`doctor` runs the helper and checks only its exit status; it never prints the password.

Set the named environment variable outside configuration for an interactive backup.
A scheduler needs that variable provisioned in its service environment; set `scheduledEnvironment: true` after doing so.
Doctor warns when a scheduled backup has no safe provisioned source.

Never put the password in a cron entry, task command or plist.

The password is never printed, written to a file or passed as a command-line argument.
Archives use AES-256-GCM with a random salt, a random nonce and a scrypt-derived key.
Keep the password in a separate password manager for recovery.

On macOS, create the named generic password in Keychain Access.
On Linux, use `secret-tool store --label="Workspace backup" service <service-name>` and enter the password at its prompt.
On Windows, add a Generic Credential with the configured target name in Credential Manager.

Run scheduled jobs under that same account with its credential store available.

The kit asks the engine for a consistent cache copy before archiving.
It skips node_modules, git metadata and symlinks, and excludes the destination folder from itself.
File sizes are checked before contents are read.

`backup.keep` defaults to 30 archives.
Retention removes only this workspace's namespaced archives after a successful backup.
Legacy archives and other workspaces' archives remain untouched.

The default limit is 128 MiB of input data; use an external encrypted backup custom step for larger workspaces.
The archive is a workspace recovery copy, not a replacement for git history or a database server backup.

```sh
node .agents/skills/works-backup/scripts/run.mjs
node .agents/skills/works-backup/scripts/run.mjs restore archive.ewb ../restore-review
```

Restore authenticates and validates every archive entry before extraction.
It requires a new folder outside the live workspace and refuses existing destinations.
Inspect the restored files, reinstall dependencies and move back only the files you choose.

## Private workspace push guard

Install the push guard from its workspace skill to refuse every normal git push from that clone.
The installer preserves an existing pre-push hook beside the new one.
It refuses hooks outside this repository's Git directory, including shared global and tracked hook folders.

Run the skill with `remove` to restore the previous hook.
Export a reviewed public tree to a separate clone when needed.

```sh
node .agents/skills/works-push-guard/scripts/run.mjs
```

The kit has no required editor, notification service, tracker, remote repository or cloud provider.
See [CONTRIBUTING.md](CONTRIBUTING.md) for tests and release preparation.
