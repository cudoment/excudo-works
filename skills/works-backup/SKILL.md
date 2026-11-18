---
name: works-backup
description: "Use when the owner requests an encrypted workspace backup or a separate-folder restore for review."
---

# works-backup

Encrypt the workspace into an owner-chosen folder and restore only into a new separate folder.

## Procedure

Set backup.folder and a password source first.
Use keychainService on macOS, secretService on Linux or credentialName on Windows for unattended jobs.
An environment variable needs separate scheduler provisioning. Never print or write the password. The archive uses authenticated encryption and skips dependency folders, git metadata and symlinks.

`backup.keep` defaults to 30 archives from this workspace only.
Sizes are checked before file contents are read.

Keep a password recovery copy outside this workspace. Review restored files before moving anything back. Large workspaces should use an external encrypted backup custom step.

Run from the workspace after reading AGENTS.md and preserving concurrent edits.
Inspect the result and explain any unresolved decision to the owner.

```sh
node .agents/skills/works-backup/scripts/run.mjs
node .agents/skills/works-backup/scripts/check.mjs --json
```

For restore, run `node .agents/skills/works-backup/scripts/run.mjs restore <archive> <new-folder>`.

## Verification

The check reads durable results without changing workspace content.
Run `node .agents/skills/works-backup/scripts/check.mjs --self-test` to verify its known failure cases.
A failed check keeps the work open; fix or report the specific requirement before marking it done.
