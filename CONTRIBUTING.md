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
5. Add a Changeset with `bun run changeset` for each publishable package change.
6. Run the full Definition of Done before handoff.

Use deterministic tests. Inject clocks, use Vitest fake timers, seed random values, and fake external edges. Unit tests must not use a real network or filesystem. Reuse the shipped `@plainworks/testkit` package instead of creating package-local copies of shared fakes. Package tests may import `testkit` upward; `std` keeps local fakes because `testkit` depends on it.

## Validate the change

Run focused checks while developing:

```sh
turbo run typecheck build test --filter=@plainworks/<name>
turbo run typecheck build test --filter='...[origin/main]'
```

Run every repository gate before handoff:

```sh
bun run check-versions
bun run lint
bun run check-comments
bun run typecheck
bun run check-boundaries
bun run build
bun run test
bun run check-packaging
```

`bun run format` applies Biome fixes. Coverage must stay at or above **80% per package** and **85% for security-critical packages such as `auth`**.

## Add a package

Generate every package from the golden template:

```sh
bun run gen package
```

For non-interactive generation:

```sh
bun run gen package --args state "Reactive state primitives" false
```

Then add the package to the `LAYERS` table in [`internal/boundaries/.dependency-cruiser.cjs`](internal/boundaries/.dependency-cruiser.cjs) and update the layer maps in [`README.md`](README.md) and [`docs/architecture.md`](docs/architecture.md). An unregistered package cannot import another `@plainworks/*` package.

Use **one plain word** for one concern. Do not use names such as `core`, `engine`, `foundation`, or `utils`.

Use the [`new-package` skill](.github/skills/new-package/SKILL.md) for the complete workflow. Use [`new-backend`](.github/skills/new-backend/SKILL.md) when adding a state store, channel transport, authentication mechanism, or query adapter behind an existing seam.

## Follow package boundaries

| Rule | Requirement |
|---|---|
| Dependency direction | Import only from a strictly lower layer. Define shared seams in the lower layer and implement them higher. |
| Neutral entry | Keep `.` free from React, DOM globals, Node builtins, and framework assumptions. |
| Client entry | Put React or browser bindings behind `./client`. Mark client-only modules with `"use client"`. |
| Package manifest | Set `"type": "module"`, `"sideEffects": false`, `"files": ["dist"]`, and correct `exports` and `types`. Never commit `dist`. |
| Public APIs | Use typed, minimal surfaces. Do not expose `any`, unchecked casts, or string throws. |
| Errors | Preserve causes with typed errors. Do not swallow exceptions or return success-shaped fallbacks. |
| Runtime behavior | Do not create import-time side effects or module-level singletons. |
| Adapters | Register through an injected `register()` or `createX({...})` path. Do not use implicit `init()` behavior. |
| Authentication | Keep tokens in headers or secure `__Host-` cookies. Never use URLs or web storage. |
| Dependencies | Use `catalog:` and `workspace:*`; never inline dependency versions. |
| Documentation | Add TSDoc to every public export and `@throws` for typed errors. Keep Markdown paragraphs on one source line. |

The [`LAYERS` table](internal/boundaries/.dependency-cruiser.cjs) is authoritative. [Architecture](docs/architecture.md) explains package placement, host independence, and the runtime primitive contract.

## Submit the change

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>(<scope>): <short summary>
```

Use `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, or `ci`. Keep **one commit per branch** and amend it when needed. Do not add a `Co-authored-by` trailer.

Open the pull request against `main` as a **draft**. Complete the [pull request template](.github/PULL_REQUEST_TEMPLATE.md), keep the description high-level, and let the diff carry implementation detail. Treat review comments as patterns: fix every relevant instance across the change set.

Pre-1.0 breaking changes use a **minor** Changeset. Non-breaking changes use a **patch** Changeset. Changesets own package versions and release notes.

Make sure CI, including the generator smoke job, is green before review. Maintainers squash-merge approved changes and handle package versioning and publishing.

## Reference

- [Engineering baseline](.github/copilot-instructions.md)
- [Architecture](docs/architecture.md)
- [Development skills](.github/skills/README.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
