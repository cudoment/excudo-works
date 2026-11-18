# Contributing

Keep this package useful to any knowledge worker and keep private workspace content out of its history.

## Develop

Install Node 22.16 or later and a compatible registry release of Excudo.

```sh
npm install --save-dev excudo@^0.7.0
npm test
npx --no-install excudo skills lint skills/works-daily
```

A deliberate local engine integration may use `file:../excudo` as the development dependency.
This development checkout can link an existing engine dependency tree without changing engine sources.
Release checks reject local dependencies until they are replaced by registry versions.

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

```sh
npm run changelog
npm test
npm run release:check
npm pack --dry-run
```

The release check requires a clean working tree, registry dependencies, a current changelog, a passing denylist scan and passing tests.
It also verifies the package file inventory.
The maintainer clone refuses every push through its pre-push hook; export a reviewed public tree separately.
Publishing and pushing require an explicit owner request.
