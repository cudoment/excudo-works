---
name: works-daily
description: "Run when the owner requests a complete daily routine or asks why scheduled automation was skipped."
---

# works-daily

Run the ordered routine with per-step timeouts, a workspace lock and durable result records.

## Procedure

Inspect doctor output first. A partial manual run never suppresses a scheduled run. Preserve the lock until its process exits; inspect owner.json before recovering a stale lock.

Run from the workspace after reading AGENTS.md and preserving concurrent edits.
Inspect the result and explain any unresolved decision to the owner.

```sh
node .agents/skills/works-daily/scripts/run.mjs
node .agents/skills/works-daily/scripts/check.mjs --json
```

## Verification

The check reads durable results without changing workspace content.
Run `node .agents/skills/works-daily/scripts/check.mjs --self-test` to verify its known failure cases.
A failed check keeps the work open; fix or report the specific requirement before marking it done.
