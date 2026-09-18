---
"create-plainworks": patch
---

Add `create-plainworks`, the initializer that scaffolds a working plainworks app in one command (`npm create plainworks@latest` / `bunx create-plainworks`). It generates a ready-to-run project, pins the kit to concrete published versions, and can install dependencies and initialize a git repo for you.

- **One command to a running app** — pick a name, get a Next.js App Router / RSC project with an in-process mock backend and identity provider, so you can sign in and explore the gated pages before wiring a real API or IdP.
- **You own the output** — no hidden runtime or black-box config; the generated app is plain source you edit, with every `@plainworks/*` dependency pinned to an exact version (no `workspace:`/`catalog:` protocol leaks).
- **Parametric by host** — a `--host` flag selects which example to eject, starting with `next`, so more hosts can ship without changing the CLI.
- **Scriptable and interactive** — flags (`--host`, `--no-install`, `--no-git`, `--yes`) drive it unattended; omit them and it prompts. It detects the package manager from the invoking agent.
