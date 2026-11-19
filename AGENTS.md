This file is for changing the kit; installers follow the "Install with a coding agent" section of README.md.

# Contributor instructions

Keep the kit portable and configured by workspace settings.
Read README.md before changing public behavior (README.ko.md, README.ja.md and README.zh-CN.md are short guides that must keep the same commands, ranges and agent rules) and preserve user files during initialization and upgrades.
Call engine commands for engine-owned features instead of reproducing them.

Preserve private workspace boundaries and run the private denylist scan before committing.
Never add machine-specific paths, private source text or personal account information.
Keep changes focused, run meaningful tests and retain failing skill cases.

Do not push or publish from this clone.
Use the repository's existing git identity and clear English commit messages.
Do not add agent or tool attribution to commit messages or pull requests.
