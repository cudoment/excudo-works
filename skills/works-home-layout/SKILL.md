---
name: works-home-layout
description: "Use when the owner requests a Home layout check or explicitly authorizes Home changes."
---

# works-home-layout

Check that personal plans appear above work queries without rewriting the owner Home.

## Procedure

Configure home.file and the personal/work headings. Home belongs to the owner. Change only the requested area and compare the work area with the pre-edit version. The script is read-only and checks the order of areas and query fences; it cannot infer owner permission.

Run from the workspace after reading AGENTS.md and preserving concurrent edits.
Inspect the result and explain any unresolved decision to the owner.

```sh
node .agents/skills/works-home-layout/scripts/run.mjs
node .agents/skills/works-home-layout/scripts/check.mjs --json
```

## Verification

The check reads durable results without changing workspace content.
Run `node .agents/skills/works-home-layout/scripts/check.mjs --self-test` to verify its known failure cases.
A failed check keeps the work open; fix or report the specific requirement before marking it done.
