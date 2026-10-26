# Contributing to plainworks

## Start here

```sh
git clone https://github.com/kbukum/plainworks.git
cd plainworks
bun install
bun run --filter @plainworks/showcase test
```

You need **Bun 1.3.6 or newer** and **Node `^22.12 || ^24 || >=26`**. The root install provides the rest of the toolchain.

Follow the [Contributor Covenant](CODE_OF_CONDUCT.md). Be respectful, constructive, and patient.

## Make a change

1. Update `main`, then create a `kbukum/<change>` branch named for the outcome.
2. Write a failing behavioral test.
3. Implement the smallest complete fix, then refactor while the test stays green. Keep unrelated refactors out of the change.
4. Run the scoped gates for every affected package.
5. Update the package's Changeset if its summary no longer fits ([one note per package until the first release](.changeset/README.md)).
6. Run the full [Definition of Done](.github/engineering.md#definition-of-done) before handoff.

Every change follows the [engineering standard](.github/engineering.md). Read the section that matches your change; [Testing and proof](.github/engineering.md#testing-and-proof) covers deterministic tests and the shared `@plainworks/testkit` fakes.

## Validate the change

Run focused checks while developing:

```sh
bun run verify --filter=@plainworks/<name>
bun run verify --filter='...[origin/main]'
```

Run every repository gate before handoff. `verify` runs them in order and stops at the first failure; `bun run verify --list` shows what each gate enforces:

```sh
bun run verify
```

`bun run format` applies Biome fixes. Coverage floors are part of [Testing and proof](.github/engineering.md#testing-and-proof).

## Add a package

Generate every package from the golden template:

```sh
bun run gen package
```

For non-interactive generation:

```sh
bun run gen package --args state "Reactive state primitives" false
```

Then add the package to [`internal/boundaries/layers.json`](internal/boundaries/layers.json) and run `bun run sync-layer-map` to regenerate the layer maps in the docs. An unregistered package cannot import another `@plainworks/*` package.

Use **one plain word** for one concern; see [Code structure](.github/engineering.md#code-structure).

Use the [`new-package` skill](.github/skills/new-package/SKILL.md) for the complete workflow. Use [`new-backend`](.github/skills/new-backend/SKILL.md) when adding a state store, channel transport, authentication mechanism, or query adapter behind an existing seam.

## Change a UI atom

The shadcn atoms in `packages/elements/src/shadcn/` are **vendored** and **locked** by `shadcn.lock.json`. Never edit them by hand; `registry:validate` fails CI if you do.

```sh
bun run --filter @plainworks/elements registry:update <atom>
```

To change how an atom looks or behaves, follow the [deviation ladder](.github/engineering.md#vendored-atoms). Use the [`update-atoms` skill](.github/skills/update-atoms/SKILL.md) to bump the shadcn CLI or refresh every atom.

## Follow the rules

[Architecture](docs/architecture.md) says where code goes; [`internal/boundaries/layers.json`](internal/boundaries/layers.json) is the authoritative layer map. The [engineering standard](.github/engineering.md) holds the rules every change follows: ownership, public API, host independence, security, UI, tests, docs, and dependencies. The gates in `bun run verify` enforce what they can; reviewers check the rest.

## Submit the change

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>(<scope>): <short summary>
```

Use `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, or `ci`. Keep **one commit per branch** and amend it when needed. Do not add a `Co-authored-by` trailer.

Open the pull request against `main` as a **draft**. Complete the [pull request template](.github/PULL_REQUEST_TEMPLATE.md), keep the description high-level, and let the diff carry implementation detail. Treat review comments as patterns: fix every relevant instance across the change set.

Changesets own package versions and release notes. Until the first release each package keeps one `minor` note. After it, pre-1.0 breaking changes use a **minor** Changeset and other changes a **patch** one.

Make sure CI, including the generator smoke job, is green before review. Maintainers squash-merge approved changes and handle package versioning and publishing.

## Reference

- [Engineering standard](.github/engineering.md)
- [Architecture](docs/architecture.md)
- [Development skills](.github/skills/README.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
