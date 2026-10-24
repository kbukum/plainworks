---
name: validate
description: "plainworks: Run the repository's build, test, lint, and documentation gates scoped to the change."
---

# Validate

`bun run verify` is the gate runner. It runs every gate in order and stops at the first failure; `internal/verify` owns the list, and CI and release call the same command. What "done" means is the [Definition of Done](../../engineering.md#definition-of-done); this skill is how to prove it.

## Run the gates

```bash
bun run verify --list                          # each gate, in order, and what it enforces
bun run verify --filter=@plainworks/<name>     # one package and what it needs
bun run verify --filter='...[origin/main]'     # packages affected by the diff
bun run verify                                 # everything: acceptance, audits, releases
```

`--filter` takes any turbo filter and repeats. It scopes the package gates; repo-wide gates are cheap and always run over the whole graph.

While iterating, run one gate directly: `turbo run test --filter=@plainworks/<name>`, or a root script such as `bun run lint` (`bun run format` fixes) or `bun run check-shape`. Finish with `verify`.

Prose-only edits need documentation checks only: links, anchors, real commands, `bun run lint`, and `bun run check-layer-map` when a generated block is nearby.

## Add the checks the change needs

| Change touches | Also run |
|---|---|
| `internal/boundaries/layers.json` or `.dependency-cruiser.cjs` | `turbo run test --filter=@plainworks/boundaries`, then `bun run sync-layer-map` |
| `packages/elements` | `bun run check-registry` and `turbo run test --filter=@plainworks/elements` |
| `packages/theme` | `turbo run test --filter=@plainworks/elements` (theme-variables contract) |
| `turbo/generators/**` | [Generator smoke](#generator-smoke) |
| `apps/next-host`, the eject, or a starter dependency | `cd packages/create-plainworks && bun run smoke` |
| An integration or package boundary | [Clean consumers](#clean-consumers) |
| Something an app user can see | [App proof](#app-proof) |

A registry lock failure means a file under `src/shadcn/` changed outside the pipeline. Never relock by hand: restore it or rerun `registry:update <atom>`, and move the change down the [deviation ladder](../../engineering.md#vendored-atoms).

## Generator smoke

Mirror the CI smoke job. First confirm `packages/smoke-server`, `packages/smoke-client`, and `internal/smoke-tool` do not exist; if any does, stop, because it is not yours.

```bash
bun run gen package --args smoke-server "CI smoke: server-only" false
bun run gen package --args smoke-client "CI smoke: client entry" true
bun run gen tool --args smoke-tool "CI smoke: internal tool"
bun run verify --filter=@plainworks/smoke-server --filter=@plainworks/smoke-client --filter=@plainworks/smoke-tool
```

Then check what CI asserts: `smoke-client/dist/client.js` starts with `"use client"` and `dist/index.js` does not, and `smoke-server` has no client source, config, export, or build. Finally remove exactly those three folders and run `bun install`.

## Clean consumers

A workspace build cannot prove dependency isolation. Install packed tarballs into clean projects and prove three consumers: core alone with no integration or driver, a consumer adapter built only on public contracts, and the selected integration with its driver. Inspect manifests, installed dependency graphs, browser graphs, and shipped sources. A new integration package also proves its generated shape, packaging, and negative layer rules.

Native loading, filesystem contention, process cleanup, and TLS need real integration tests on the declared runtimes; unit doubles cannot certify them. This proof is manual today; see [Known gaps](../../engineering.md#known-gaps).

## App proof

For a change an app user can see, `verify` is not enough. In the app:

```bash
bun run e2e -- e2e/flows.spec.ts --grep "<flow>"   # touched flows; failures leave .ui-artifacts/latest/report.md
bun run ui:capture --flow <flow>                   # then open and judge the frames
bun run ui:capture serve                           # optional warm host for faster captures
```

Exit code 1 means a flow broke; exit code 2 means the harness could not run, so fix the setup instead of retrying. Use `serve --explore` for a separate signed-out MCP host. Session tests reset before a fresh sign-in and never reuse credential-bearing storage. Outage and restart flows need their own host. Real HTTPS proof trusts an isolated CA in Node and the browser; never bypass TLS validation. The [browser gate](../../../docs/browser-gate.md) explains the suite.

## Report

State which gates ran, scoped or full, and what they did not prove. Green gates do not catch unbounded buffers, missing cancellation, singletons, import-time I/O, or credentials in URLs; those belong to [review](../review/SKILL.md). Validation never commits, pushes, or publishes.
