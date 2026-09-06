# Changesets

This folder holds [Changesets](https://github.com/changesets/changesets) — one Markdown file per user-facing change, describing the affected packages and the semver bump.

Add one with:

```sh
bun run changeset
```

Every PR that changes a publishable package must include a changeset (structural/tooling-only PRs may add an empty one with `--empty`).
