---
name: works-improve
description: "Use when report feedback requests a code change or the owner asks for an improvement plan."
---

# works-improve

Turn a recorded code request into reviewable worker and merge commands.

## Procedure

Read open improvements and owner principles. The script prints the configured engine worker command without executing it. Work on an isolated branch, reproduce the problem and run focused checks.

Request independent review before an owner-approved merge. Never change agent choices, dependencies or principles to satisfy a request without authorization. Optional editor integrations may launch the same command.

Close a finished request with `npx --no-install excudo-works improvements close <id>`.
The next open request is then selected.

Run from the workspace after reading AGENTS.md and preserving concurrent edits.
Inspect the result and explain any unresolved decision to the owner.

```sh
node .agents/skills/works-improve/scripts/run.mjs
node .agents/skills/works-improve/scripts/check.mjs --json
```

## Verification

The check reads durable results without changing workspace content.
Run `node .agents/skills/works-improve/scripts/check.mjs --self-test` to verify its known failure cases.
A failed check keeps the work open; fix or report the specific requirement before marking it done.
