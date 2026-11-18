---
name: works-push-guard
description: "Use when the owner wants to prevent any push from a private workspace clone."
---

# works-push-guard

Install a local pre-push hook that refuses every push from this clone.

## Procedure

Initialize git first.
The hook folder must resolve inside this repository Git directory.
Shared global and tracked hook folders are refused.

 Preserve an existing hook beside the new hook. Run status and inspect the hook after installation. Export and review a separate public tree when needed. This guard protects normal git pushes; it does not classify private content or replace review.

Use `node .agents/skills/works-push-guard/scripts/run.mjs remove` to restore the previous hook.

Run from the workspace after reading AGENTS.md and preserving concurrent edits.
Inspect the result and explain any unresolved decision to the owner.

```sh
node .agents/skills/works-push-guard/scripts/run.mjs
node .agents/skills/works-push-guard/scripts/check.mjs --json
```

## Verification

The check reads durable results without changing workspace content.
Run `node .agents/skills/works-push-guard/scripts/check.mjs --self-test` to verify its known failure cases.
A failed check keeps the work open; fix or report the specific requirement before marking it done.
