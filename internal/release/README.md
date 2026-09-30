# @plainworks/release

Dev-only, never published. `@plainworks/release` is the monorepo's release and packaging tool: it derives the npm publish order from the workspace graph, checks that publishable workspace versions stay on the intended Changesets line, and packs workspaces the way npm publishes them.

## Common commands

```bash
plainworks-release publish-set
plainworks-release publish-set --json
plainworks-release publish-set --check
plainworks-release check-line
plainworks-release pack packages/std
plainworks-release check-packaging packages/std
```

## What each command does

| Command | What it does |
|---|---|
| `publish-set` | Prints the publish order as repo-relative workspace directories, one per line. |
| `publish-set --json` | Prints `[{ dir, name, version }, ...]` in publish order. |
| `publish-set --check` | Verifies that the derived publish order covers every publishable workspace. |
| `check-line` | Checks publishable workspace versions against `.changeset/pre.json`: prerelease versions must stay on the active tag, and stable mode must not leave stray prereleases behind. |
| `pack <dir> [--destination <dir>]` | Runs `bun pm pack`, resolves `catalog:` and `workspace:*`, applies `publishConfig`, removes the repo-only `@plainworks/source` export condition from the tarball manifest, and prints the tarball path. |
| `check-packaging [dir]` | Packs the workspace the same way, then runs `publint --strict` and are-the-types-wrong against that tarball. When `dir` is omitted it checks `.`; when the workspace has no `exports`, it skips the type check. |

Every package's `check-packaging` script calls `plainworks-release check-packaging`, and the release workflow publishes tarballs produced by `plainworks-release pack`.
