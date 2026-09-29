# @plainworks/release

Release and packaging tool for the monorepo.

## Commands

```bash
plainworks-release publish-set --check
plainworks-release check-line
plainworks-release pack packages/std
plainworks-release check-packaging packages/std
```

`pack <dir> [--destination <dir>]` creates the tarball npm publishes: it resolves `catalog:` and `workspace:*`, applies `publishConfig`, and removes the repo-only source condition. `check-packaging [dir]` runs `publint --strict` and are-the-types-wrong against that tarball.

Every package's `check-packaging` script calls `plainworks-release check-packaging`, and the release workflow publishes tarballs produced by `plainworks-release pack`.
