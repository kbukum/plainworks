# create-plainworks

> The plainworks project initializer. One command scaffolds a wired, runnable app that assembles the published `@plainworks/*` surfaces over a local mock backend — so you start from a working spine, not a bare React app.

Part of the [plainworks](../../README.md) kit.

## Quickstart

```sh
npm create plainworks my-app
# or
bunx create-plainworks my-app
```

Then:

```sh
cd my-app
npm run dev
```

The generated app boots **with data** on first run — a seeded mock backend serves its domain over real HTTP, so the client, RSC prefetch, and live stream all read one set of fixtures with no external service to stand up.

## What you get

A minimal but fully wired host: the composition kernel, `theme`, `query`, `channel`, `state`, `ui`, and `auth` (BFF `__Host-` cookie by default) over the generic `mocks` primitives, with a small starter domain. It follows the kit's rules by construction — per-request factories (no module-level singletons), the neutral/client/server three-bucket split, and server-only token custody kept out of the client graph. The config is plain and fully yours to edit; there is no black-box runtime.

## Options

| Flag | Default | Effect |
| --- | --- | --- |
| `--host <name>` | `next` | Host template to generate. `next` ships today; the flag is the seam for more. |
| `--no-install` | install | Skip installing dependencies. |
| `--no-git` | git init | Skip initializing a git repository. |
| `-y`, `--yes` | prompt | Accept defaults without prompting (for CI). |
| `-h`, `--help` | — | Show help. |

## Versions

The generated `package.json` resolves workspace protocol ranges so the scaffolded project stands alone: every `@plainworks/*` dependency is pinned to the exact published version this initializer ships with, and shared third-party dependencies are resolved from the catalog semver ranges (no `workspace:` or `catalog:` protocols leak). A drift check keeps that version map in sync with the monorepo catalog.
