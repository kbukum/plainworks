---
applyTo: "turbo/generators/**"
---

The `@turbo/gen` generators create workspaces that pass `check-shape` without hand fixup. Follow the full baseline in [`../../.github/copilot-instructions.md`](../../.github/copilot-instructions.md).

## Generators

| Generator | Creates | Use |
|---|---|---|
| `bun run gen package` | `packages/<name>` | A published `@plainworks/*` package with optional `./client`. |
| `bun run gen tool` | `internal/<name>` | A dev-only tool with `src/cli.ts`, `src/command.ts`, a colocated test, and bin `plainworks-<name>`. |

## Layout

- `config.ts` defines both generators, prompts, helpers, and actions.
- `templates/package/**` holds only hand-written package fields and source files. Generated manifest fields (`exports`, `files`, `sideEffects`, scripts, preset dev dependencies) come from `plainworks-shape sync`.
- `templates/client/**` and `templates/client-root/**` add the `"use client"` entry, client source project, and client tests when `hasClient` is true.
- `templates/tool/**` creates the internal tool profile: source under `src/`, colocated tests, `tsconfig.json` extending `../../tsconfig.tool.json`, and no root source files or `test/` directory.

The final generator action runs `bun install` and `plainworks-shape sync`, so the generated output should already match the profile.

## Rules

- **Generated output must pass with no manual fixup.** CI generates a server package, a client package, and a tool, then runs `verify` over them.
- **Catalog discipline.** Dependencies and peer ranges in templates use `catalog:` or `workspace:*`. Never inline a version.
- **Derived package surface.** A package template declares `export const build: PackageBuild = { entry: ... }` in `tsdown.config.ts`, then `export default preset(build)`. To add a subpath, add it to `build.entry`; do not hand-write `exports` or `files` in the package template.
- **Server/client correctness.** `hasClient: true` adds the `./client` source entry, a top-of-file `"use client"` directive, a DOM-free client project plus a DOM test project for its tests, `react`/`react-dom` peer ranges, and UI test dependencies. Server `.` remains React/DOM-free. Client modules never import the server barrel.
- **Vitest preset.** Package and tool templates use `testConfig` from `@plainworks/vitest-config`. App-shaped workspaces use `appTestConfig`. Override only what the workspace needs, and explain each override with a short comment.
- **Primitive contract in the README.** `README.md.hbs` carries a **Runtime primitives** section. Keep it accurate when the generated package adds a host-varying seam or a DOM client surface.
- **Handlebars hygiene.** Keep `.hbs` files valid after stripping the extension; `stripExtensions: ["hbs"]` writes the final filename. New template files must be picked up by the template glob.
- **Typecheck the generator itself.** `bun run typecheck` compiles `turbo/generators/tsconfig.json`; keep `config.ts` type-clean.

Validate a generator change end-to-end by generating a throwaway package, checking its shape and gates, then removing it:

```bash
bun run gen package --args scratch "Scratch." false
bun run check-shape
turbo run typecheck build test check-packaging --filter=@plainworks/scratch
rm -rf packages/scratch && bun install
```
