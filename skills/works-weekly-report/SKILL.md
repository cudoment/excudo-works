---
name: works-weekly-report
description: "Run when the owner requests a weekly report or the routine reaches its report step."
---

# works-weekly-report

Write a weekly memo-task report while preserving owner notes and pending decisions.

## Procedure

Sync edits before generating. DONE tasks belong to the period; DOING and WAITING remain visible. Dated completion properties take precedence over file modification time.

The engine collects activity across its tracked work folders. An optional report adapter adds tracker links. Missing or ambiguous markers stop generation instead of replacing user text.

Run from the workspace after reading AGENTS.md and preserving concurrent edits.
Inspect the result and explain any unresolved decision to the owner.

```sh
node .agents/skills/works-weekly-report/scripts/run.mjs
node .agents/skills/works-weekly-report/scripts/check.mjs --json
```

## Verification

The check reads durable results without changing workspace content.
Run `node .agents/skills/works-weekly-report/scripts/check.mjs --self-test` to verify its known failure cases.
A failed check keeps the work open; fix or report the specific requirement before marking it done.
