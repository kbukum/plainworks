---
name: release
description: >-
    Cut a release of the plainworks monorepo with Changesets — verify pending changesets, run the
    full pre-release gates, version the affected packages, and publish the @plainworks/* packages to
    npm in dependency order. Use when preparing or publishing a plainworks release or checking
    release readiness.
---

# Releasing plainworks

plainworks is a bun-workspace monorepo of independently-versioned `@plainworks/*` packages published to **npm** under the `@plainworks` scope. Releases are **Changesets-driven**: each change carries a changeset (its release-note + semver-bump intent), and Changesets aggregates them into version bumps and a generated changelog. There is no hand-maintained CHANGELOG. Distribution today is npm only — the copy-in registry is a parked, later deliverable.

## Alpha stage — pre-release line

plainworks is **pre-stable**, shipping on the `0.1.0-alpha.x` line (matching gokit/rskit's `v0.1.0-alpha.1`). New packages are born at `0.1.0-alpha.1` (the golden generator seeds this). While in alpha:

- Publish under the **`alpha` npm dist-tag**, never `latest` — so `npm install @plainworks/<name>` does not pull a pre-release by default. `latest` is reserved for the first stable `0.1.0`.
- Manage the pre-release suffix with Changesets **pre mode**, so the `-alpha.N` counter is Changesets-owned rather than hand-edited:

  ```bash
  bun x changeset pre enter alpha   # once, to open/stay on the alpha line
  # ... normal Step 1–5 flow below; changeset version now emits 0.1.0-alpha.N ...
  bun x changeset pre exit          # only when graduating the line to stable 0.1.0
  ```

- Publishing (Step 5) is invoked with the `alpha` tag while in pre mode:

  ```bash
  bun publish --tag alpha    # per package, in dependency order — see Step 5
  ```

Everything below is the same for a stable release; in alpha, `pre enter alpha` is active and publishing carries `--tag alpha`.

## Prerequisites

- Push access to `github.com/kbukum/plainworks` and publish rights to the `@plainworks` npm scope.
- On `main`, clean working tree, `bun install` current.
- npm auth for the maintainer running the publish (`npm whoami` resolves, or `NPM_TOKEN` set).

## Step 1 — Confirm there is something to release

```bash
ls .changeset/*.md            # pending changesets (excluding README.md/config.json)
bun run changeset status      # what would be versioned, and at what bump
```

If there are no pending changesets, **refuse to release** — nothing to ship. Every merged change should have arrived with a changeset (the `create-pr` / `validate` gates require one); if one is missing, add it now with `bun run changeset` before versioning.

## Step 2 — Full pre-release gate

A release is the one time to run the **complete** gates rather than the affected set:

```bash
bun run check-versions        # sherif + syncpack: catalog is the single source of versions
bun run lint
bun run typecheck
bun run check-boundaries      # zero upward/sideways imports, zero cycles
bun run build                 # tsdown, ESM-only, every package ships dist/
bun run test                  # vitest + coverage (>=80% per package, >=85% for auth)
```

Also run the [`review`](../review/SKILL.md) project audit in a fresh agent before a release. Treat green gates as necessary but not sufficient. Sanity-check the built artifacts before publishing:

```bash
(cd packages/<name> && bun pm pack)   # inspect the tarball: only dist/, correct exports/types/files
```

Confirm each publishable package's `package.json` has `"files": ["dist"]`, correct `exports` (`.` and, where present, `./client`), `"type": "module"`, and `react`/`react-dom` as `catalog:` peer ranges (never a hard dep).

## Step 3 — Version the packages

Let Changesets consume the pending changesets, bump the affected packages (and their internal dependents), and write the generated changelog entries:

```bash
bun run changeset version
bun install                   # refresh the lockfile after version bumps
```

Review the diff: the version bumps, the deleted `.changeset/*.md`, and the changelog additions. This is the release commit content. While in `0.x`, a breaking change bumps **minor**, otherwise **patch** — Changesets handles this from each changeset's declared bump.

## Step 4 — Land the version bump through a reviewed PR

`main` is protected — the version bump lands like any other change, on a branch, reviewed:

```bash
git switch -c kbukum/release-<date>
git add -A
git commit -m "chore(release): version packages"
git push -u origin kbukum/release-<date>
gh pr create --draft --base main --title "chore(release): version packages" --body-file <path>
```

Per repo workflow the maintainer reviews and merges. Do not push the bump directly to `main`.

## Step 5 — Tag and publish (after merge)

On merged `main`, clean tree, the maintainer publishes locally (there is no CI release workflow today; if one is added later it must be SHA-pinned, minimally permissioned, and carry the scoped `NPM_TOKEN` — and it must still publish through `bun publish`, below):

```bash
git switch main && git pull --ff-only
bun run build                 # fresh dist/ for every package
bun run changeset tag         # create the per-package git tags for the bumped versions
git push --follow-tags        # push the tags Changesets created
```

Then publish each package **in dependency order** (lowest layer first: `std`, then L1, L2, L3, L4 — see the layer map) with `bun publish`:

```bash
(cd packages/std && bun publish --tag alpha)   # repeat per package, lowest layer first
```

Publish with **`bun publish`, never `changeset publish`**: package manifests carry Bun `catalog:` ranges (and internal `workspace:*` deps), and only Bun rewrites those into concrete versions in the published manifest — `changeset publish` shells out to `npm publish`, which would ship the raw protocols and produce unusable packages. While in pre mode (alpha), always pass `--tag alpha`; for a stable release, drop the tag. Skip a package whose version is already on npm, and never publish anything `"private": true` (apps, `internal/*`). Then draft the GitHub Release from the generated changelog if desired.

## Guardrails

- **Never** run destructive git commands (`reset --hard`, `checkout -- .`, `clean`) on uncommitted work without explicit permission.
- **Never** publish from a dirty tree or an unbuilt `dist/`.
- Per repo workflow, the agent prepares the branch/version bump; **the maintainer merges the PR, tags, and runs the actual publish** unless explicitly asked otherwise. Open a PR only when explicitly requested, in **draft**, following the PR template.
- All CI actions must be SHA-pinned; a future CI publish workflow must carry the minimum permissions and the scoped npm token.
- Reference other-repo items with full URLs, never bare `#123`.
