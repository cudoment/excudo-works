---
name: works-sync-edits
description: "Use when the owner edits a generated report or adds answers and comments to To check."
---

# works-sync-edits

Compare report edits with the last generated snapshot before changing memo tasks.

## Procedure

Read policy.json first. The script applies permitted title and status edits only when the source still matches. Completion, removal and conflicts remain decisions.
Scheduled writes require the engine idle gate and hold its graph lock.
Append `--scheduled` when running this skill as an individual scheduled job.

Only kit-written memo files are saved with the engine after applying edits.

The configured worker judges natural language comments read-only; only validated policy-permitted task edits apply. Preserve every pending item and explain the smallest decision needed. Prefix code requests with improve: or code: after the comment delimiter.

Use ` // apply` or ` // 적용` on a question to approve its original source snapshot.
Use ` // done`, ` // dismiss`, ` // 완료` or ` // 무시` to close an item.

Run from the workspace after reading AGENTS.md and preserving concurrent edits.
Inspect the result and explain any unresolved decision to the owner.

```sh
node .agents/skills/works-sync-edits/scripts/run.mjs
node .agents/skills/works-sync-edits/scripts/check.mjs --json
```

## Verification

The check reads durable results without changing workspace content.
Run `node .agents/skills/works-sync-edits/scripts/check.mjs --self-test` to verify its known failure cases.
A failed check keeps the work open; fix or report the specific requirement before marking it done.
