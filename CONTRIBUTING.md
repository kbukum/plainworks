# Contributing to plainworks

Thanks for your interest in contributing! plainworks is a host-independent React/TypeScript kit — a set of small, single-concern `@plainworks/*` packages with a strict layer map and a golden generator. This guide gets you productive fast and explains the gates every change must pass.

Be respectful, constructive, and patient. We follow the [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) — see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

---

## Prerequisites

- **[Bun](https://bun.sh)** `>= 1.3.6` — the package manager and test/build runner (the repo pins `bun@1.3.6` via `packageManager`).
- **Node** `^22.12 || ^24 || >=26` — for tooling that runs under Node.
- That's it. There is no global toolchain to install; `bun install` provisions everything from the root catalog.

```sh
git clone https://github.com/kbukum/plainworks.git
cd plainworks
bun install
```

---

## The gates (Definition of Done)

Every change must pass the same six gates CI runs, in this order. Run them from the repo root:

```sh
bun run check-versions    # single-catalog / dedupe (Sherif + Syncpack)
bun run lint              # Biome (format + lint)
bun run typecheck         # tsc --noEmit across the workspace
bun run check-boundaries  # dependency-cruiser layer gate (no upward imports)
bun run build             # tsdown builds every package
bun run test              # Vitest + coverage (≥ 80% package / ≥ 85% security-critical)
```

Scope work to what changed instead of running the whole workspace every time:

```sh
turbo run test --filter=@plainworks/<name>          # one package
turbo run build test --filter='...[origin/main]'    # everything affected since main
```

`bun run format` applies Biome's fixes. Don't hand-format against it — Biome is authoritative.

---

## Making a change (test-first)

1. **Cut a branch off up-to-date `main`**, named by the change, prefixed `kbukum/` (e.g. `kbukum/state-selectors`). Update `main` first.
2. **Write the failing test first.** Every behavior starts red: assert observable behavior, not implementation. Reuse `@plainworks/testkit` harnesses/fakes — it's a shipped product, not scaffolding; never hand-roll a one-off fake that duplicates one.
3. **Make it green, then refactor.** Keep the change surgical — no drive-by refactors in the same PR.
4. **Keep determinism.** No real clock/network/filesystem in unit tests: use Vitest fake timers for backoff/reconnect/timeout, inject the clock, seed any RNG.
5. **Respect the layer map.** A package may only import downward. The single source of truth is the `LAYERS` table in [`internal/boundaries/.dependency-cruiser.cjs`](internal/boundaries/.dependency-cruiser.cjs); it's mirrored in the README and [`docs/architecture.md`](docs/architecture.md). `check-boundaries` fails on any upward or unregistered import.
6. **Add a changeset** for anything publishable: `bun run changeset`. Pre-1.0, breaking changes are a `minor`, everything else a `patch`. Don't hand-edit versions or a CHANGELOG — Changesets owns both.

The engineering baseline all of this derives from lives in [`.github/copilot-instructions.md`](.github/copilot-instructions.md). The repeatable workflows (branch, plan, validate, review, release, …) are encoded as skills in [`.github/skills/`](.github/skills/README.md) and mirrored as `/`-commands in `.claude/commands/`.

---

## Adding a new package

Never hand-roll package files — drive the golden generator so the output is gate-passing from birth:

```sh
bun run gen package                       # interactive
bun run gen package --args state "Reactive state primitives" false   # name, description, hasClient
```

Then place it in the layer map: add its row to the `LAYERS` table in `internal/boundaries/.dependency-cruiser.cjs` (and mirror it in the README / `docs/architecture.md`). A package absent from `LAYERS` fails the boundary gate by design. The `new-package` skill walks this end to end; `new-backend` covers adding a pluggable adapter (a state store, a connection transport, an auth mechanism) behind a package's seam.

**Naming:** one concern, one plain word, the same word everywhere. No `core`, `engine`, `foundation`, or `utils`.

---

## Commit style

We follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) (by convention — no CI check enforces it yet):

```
<type>(<scope>): <short summary>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`. Scope is the package short name (`state`, `auth`, `connection`, …).

```
feat(auth): add PKCE S256 challenge to the OIDC adapter
fix(connection): stop reconnect timer emitting after abort
docs(state): document the store factory contract
chore(ci): pin setup-bun to a new SHA
```

Keep **one commit per branch** — amend rather than stacking commits, unless asked otherwise. No `Co-authored-by` trailer.

---

## Pull requests

1. Push your branch and open a PR against `main` — **in draft** (mark it ready when you are).
2. Fill in the [PR template](.github/PULL_REQUEST_TEMPLATE.md) honestly: package(s) affected, the six gates, the host-independence/seams checklist, and the changeset box.
3. Keep the description high-level — the diff shows the detail. No file-by-file dumps.
4. Make sure CI is green (the six gates + the generator-smoke job).
5. Address review as a pattern, not a spot fix: if a comment reveals a class of issue, sweep the whole change set for it.

Maintainers squash-merge once approved. Version bumps and publishing are maintainer tasks (see [SECURITY.md](SECURITY.md) for the supply-chain policy).

---

## Package conventions

| Convention | Requirement |
|---|---|
| ESM-only | `"type": "module"`, `"sideEffects": false`, no CJS interop hacks |
| `exports` discipline | server-safe `.` and, where present, client `./client`; `"files": ["dist"]`; never commit `dist/` |
| Server vs client | client-only code carries `"use client"` and lives behind `./client`; `.` stays server-safe |
| No `any` in public APIs | prefer generics / discriminated unions / typed contracts |
| Typed errors | return/throw typed errors; no untyped `throw`, no swallowed `catch` |
| No import-time side effects | no network, file, or env access at module load; no module-level singletons |
| Explicit registration | adapters register via `register()` / `createX({...})`, never `init()`-style magic |
| Header-only auth | tokens in headers or `__Host-` cookies; never query string or `localStorage` |
| Catalog-pinned deps | every dependency uses `catalog:` / `workspace:*`; no inline versions |
| TSDoc on public API | every exported symbol documented; `@throws` for typed errors |
| Deterministic tests | fake timers, injected clock, seeded RNG; no real network/FS in unit tests |

---

## Related documents

- [`.github/copilot-instructions.md`](.github/copilot-instructions.md) — the engineering baseline
- [`docs/architecture.md`](docs/architecture.md) — taxonomy, layer map, server/client rationale
- [`.github/skills/`](.github/skills/README.md) — the standing workflows (branch, plan, validate, review, release, …)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — Contributor Covenant v2.1
- [SECURITY.md](SECURITY.md) — vulnerability disclosure & supply chain
- [LICENSE](LICENSE) — MIT
