---
applyTo: "turbo/generators/**"
---

The `@turbo/gen` package generator and its golden template. This is the **structural guarantee** that every `@plainworks/*` package is born identical and gate-passing — mislabeled builds, a missing `dist`, `catalog:` peers inlined, and coverage leaks cannot recur because no package is hand-written. Follow the full baseline in [`../../.github/copilot-instructions.md`](../../.github/copilot-instructions.md).

Layout:

- `config.ts` — the plop generator (`plop.setGenerator("package", …)`): prompts (`name`, `description`, `hasClient`), the `json` Handlebars helper for safe JSON interpolation, and the `addMany`/`add` actions that stamp the template.
- `templates/package/**/*.hbs` — the golden package: `package.json`, `tsconfig.json`, `tsdown.config.ts`, `vitest.config.ts`, `README.md`, and `src/` with the placeholder concern module (`hello.ts` + test) and the re-export-only `index.ts` barrel.
- `templates/client/**/*.hbs` — the re-export-only `src/client.ts` barrel plus the client concern module and its test under `src/client/`, added only when `hasClient` is true.
- `templates/client-root/*.hbs` — the package-root `tsconfig.client.json` (DOM-enabled, client-graph-only), added only when `hasClient` is true.

Rules when editing the generator or template:

- **The template must produce a package that passes every gate with no manual fixup** — `check-versions · lint · typecheck · check-boundaries · build · test`. CI regenerates both a server-only and a client package and runs all gates on the output; keep that true.
- **Catalog discipline.** Every dependency and peer range in `package.json.hbs` uses `catalog:` (or `workspace:*` for internal packages). Never inline a version — Syncpack/Sherif fail CI on it.
- **Server/client correctness.** The `hasClient` branch must add the `./client` export, a `src/client.ts` barrel carrying a real `"use client"` directive, the client concern module(s) under `src/client/`, and `react`/`react-dom` `catalog:` peers. Both entries are re-export-only barrels — implementation lives in concern modules, and client modules never import the server `.` barrel. The server `tsconfig.json` stays DOM-free and excludes the client graph; `tsconfig.client.json` typechecks `src/client.ts` + `src/client/` with the DOM libs, so the `.` entry can never silently depend on a browser global. Tests default to the `node` environment; client tests opt into jsdom per file (`// @vitest-environment jsdom`), so the server entry can never lean on DOM globals unnoticed. The CI generator smoke test asserts the directive survives into `dist/client.js` and is **absent** from `dist/index.js`. The generated client module/test is a minimal placeholder; a real client package fills it with accessible, responsive components and role-based/axe tests (see [`components.instructions.md`](./components.instructions.md) and review pass `08`). Adding the shared UI test deps (`@testing-library/*`, `vitest-axe`, `msw`) to the golden `hasClient` template — to make that floor structural — is tracked for when the `ui` package lands; introduce them via `catalog:`, never an inline version.
- **Coverage threshold** stays in `vitest.config.ts.hbs` (≥ 80%); a security-load-bearing package raises its own threshold after generation.
- **Handlebars hygiene.** Keep `.hbs` files valid after stripping the extension; `stripExtensions: ["hbs"]` writes the final filename. New template files must be picked up by the `templateFiles` glob.
- **Typecheck the generator itself.** `bun run typecheck` compiles `turbo/generators/tsconfig.json`; keep `config.ts` type-clean.

Validate a generator change end-to-end by generating a throwaway package and running the gates, then removing it:

```bash
bun run gen package --args scratch "scratch" false && bun install
turbo run lint typecheck build test --filter=@plainworks/scratch
rm -rf packages/scratch && bun install
```
