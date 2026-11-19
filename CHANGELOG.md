# Changelog

Changes are grouped by released package version.

## 0.2.0 - 2026-11-18

This release includes the following changes.

- Require Excudo 0.8.0; update installs the matching engine with the kit.
- Add Japanese and Simplified Chinese README guides and an install section that a coding agent can follow from the repository or npm address alone.
- Start installation from the engine, check the engine report before installing the kit and print every remaining command with the absolute workspace path.
- Record the kit version in the install state and report owner actions of skipped versions after update --apply.
- Treat only a missing command as a missing engine and name a non-npmjs engine registry.
- Add release safeguards: an engine link script, an install test that follows the README agent sequence and a public export that checks the clone, scans the archive and restores it on failure.

## 0.1.0 - 2026-11-17

This release includes the following changes.

- Add configurable daily runs with timeouts, locking, daily records and a final backlog.
- Preserve direct report edits and comments under an owner-controlled judgment policy.
- Add weekly reports, fixed principles, read-only cross review and optional encrypted backup.
- Ship portable workspace skills, setup diagnostics, offline-tolerant updates and feedback drafts.
