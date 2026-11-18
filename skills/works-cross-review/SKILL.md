---
name: works-cross-review
description: "Run when a configured weekly review is due or the owner requests read-only review of recent commits."
---

# works-cross-review

Ask the engine-configured independent reviewers to inspect recent commits read-only.

## Procedure

Enable review and configure engine agents.reviewers first. Review tools run in read-only modes. Save findings separately; never apply review findings automatically. A failed reviewer keeps the last successful review marker unchanged. Findings must include a trigger, evidence and a useful correction, or NO_MEANINGFUL_FEEDBACK.

Run from the workspace after reading AGENTS.md and preserving concurrent edits.
Inspect the result and explain any unresolved decision to the owner.

```sh
node .agents/skills/works-cross-review/scripts/run.mjs
node .agents/skills/works-cross-review/scripts/check.mjs --json
```

## Verification

The check reads durable results without changing workspace content.
Run `node .agents/skills/works-cross-review/scripts/check.mjs --self-test` to verify its known failure cases.
A failed check keeps the work open; fix or report the specific requirement before marking it done.
