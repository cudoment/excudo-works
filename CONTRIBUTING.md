# Contributing

Keep this package useful to any knowledge worker and keep private workspace content out of its history.

## Develop

Install Node 22.16 or later and a compatible registry release of Excudo.

```sh
npm install --save-dev excudo@^0.8.0
npm test
npx --no-install excudo skills lint skills/works-daily
```

### Develop against the local engine

`package.json` keeps the registry range at all times; the link changes only `node_modules`.

```sh
npm run engine:local              # link ../excudo (npm install --no-save)
npm run engine:local -- <path>    # link another engine clone
npm run engine:status             # print which engine is installed
npm run engine:registry           # reinstall the published range from the npmjs registry
```

Run `npm run engine:registry` before `npm run release:check`.
The release check fails when `node_modules/excudo` is a link or a local install, or when its version does not satisfy the peer range, so release tests always run against a published engine.

## Check changes

Add focused regression cases for pipeline, migration, report-edit or backup behavior changes.
Every kit skill must retain a real check, a passing case, a failing case and an engine lint score of 100.
Run `npm test` before committing and keep commits small, with clear English messages.
Do not add tool attribution to commits or pull requests.

Keep a private `private/denylist.txt` with one restricted phrase per line.
The scanner checks tracked and unignored files, including filenames, without echoing matching phrases.
With no list it passes, so public contributors do not need a maintainer's private list.
Never commit that list or private source material.

## Keep the update interface fixed

`update --apply` installs a release, then starts that release in a new process to refresh links and records.
Every future release receives the same call from every older release, so this interface is fixed.

- Arguments: `update --refresh-only --root <workspace> [--force]`. Keep these names and add options only as optional ones.
- Environment: `EXCUDO_WORKS_LOCK_TOKEN` and `EXCUDO_WORKS_LOCK_ROOT` pass the run lock, and `EXCUDO_WORKS_RESULT_FILE` names the file that receives the JSON result.
- Result: write the same JSON object that `update` prints to that file; stdout is not read, and the exit code is zero on success.

`test/round2-f1-apply.test.mjs` pins the argv and environment names of 0.1.0.
Change that test only together with a compatibility plan for older releases.

## Prepare a release

Update the version and add a release entry under `changes/`.
Write a change the owner must act on as `Area!: Summary`; the changelog lists these first under "Owner action", and `update` prints that group before anything else.

```sh
npm run engine:registry
npm run changelog
npm test
npm run release:check
npm pack --dry-run
```

The release check requires a clean working tree, a published engine inside the peer range, registry dependencies, a current changelog, a passing denylist scan and passing tests.
It also verifies the package file inventory.
Its README check covers `README.md`, `README.ko.md`, `README.ja.md` and `README.zh-CN.md`: raise the ranges and keep the agent install lines identical in every one.

## Releasing

Publish from this maintainer repository: it has `node_modules` and the private list, and `prepublishOnly` runs the release check here.
The maintainer clone refuses every push through its pre-push hook; a reviewed public tree goes out through a separate clone.
Publishing and pushing require an explicit owner request.

npm installs the version under the `latest` tag when it satisfies the requested range, and falls back to the highest satisfying version only when `latest` is outside the range.
So a release published under `next` reaches users in two different ways:

- A patch (for example 0.1.1) is invisible to `update` and to the README Start (in all four READMEs), whose range `^0.1.0` still contains `latest`, until you promote it.
- A new minor (for example 0.2.0) needs the ranges raised in all four READMEs to `^0.2.0`. A user who follows that README installs it at once, because `latest` is outside that range. So the README with the raised range reaches the public clone only after the `next` release is tested and promoted.

1. Raise the README ranges when a 0.x release takes a new minor, in this repository only; the release check compares `package.json` with all four READMEs (`README.md`, `README.ko.md`, `README.ja.md`, `README.zh-CN.md`). Do not export yet.
2. Run `npm run release:check` on the committed release candidate in this repository.
   Then run the install test, which packs the kit (and the engine) and follows the README agent sequence for `en` and `ko` in temporary folders; it needs the network and is not part of `npm test`:
   ```sh
   npm run test:install -- --engine <engine checkout>   # when the engine is released together
   npm run test:install -- --engine-version <range>     # otherwise; the default is the peer range
   ```
   It prints a pass/fail table, exits non-zero on failure and keeps the temporary folder, removing it on success.
3. The owner runs `npm publish --tag next` in this repository.
   A new package first appears as a `0.0.0-stage` placeholder while npm reviews it, and the first publish also sets `latest`.
4. Verify that the published commit is this repository's HEAD:
   ```sh
   npm view excudo-works@<version> gitHead
   git rev-parse HEAD
   ```
   Also check `npm view excudo-works dist-tags`.
   When `gitHead` equals HEAD, create the tag `v<version>` in this repository (`git tag v<version>`); it stays local.
5. Test the `next` release with its exact version (`npm install --save-dev excudo-works@<version>` in a scratch workspace).
6. Promote it:
   ```sh
   npm dist-tag add excudo-works@<version> latest
   ```
7. Only now export the tree into a clone of the public repository, review it, commit it as `Excudo Works <version>` and push:
   ```sh
   node scripts/public-export.mjs --out <public clone> [--list <denylist file>] [--ref v<version>]
   ```
   The script needs the private list, checks that the clone's `origin` matches `repository.url` in `package.json`, scans this repository before it touches the clone, requires a clean, committed HEAD that carries the tag `v<package version>` (or `--ref v<version>` to export that tagged commit), replaces the clone's tracked files with `git archive HEAD`, keeps its `.git`, scans the result and prints the next commands. It restores the clone when anything fails after it starts writing.
8. Create the `v<version>` tag on the public clone's own export commit and push that tag from the public clone. The tag in this repository stays local and is never fetched into the public clone.
