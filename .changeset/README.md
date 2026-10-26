# Changesets

This folder holds [Changesets](https://github.com/changesets/changesets): release notes and semver bumps that `bun run version:packages` turns into versions and changelogs.

Nothing has been released yet. Until the first release, each publishable package has one note, `first-alpha-<package>.md`, that describes the package as it is now:

- A change to a package updates its note when the summary no longer fits. Never add a second note.
- A new package adds its own note with a `minor` bump.
- Tooling, docs and CI changes need no note.

See [release notes](../.github/engineering.md#documentation-and-consumer-experience).
