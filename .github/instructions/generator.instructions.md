---
applyTo: "turbo/generators/**"
---

# Workspace generators

Apply the [baseline](../copilot-instructions.md) and [package profiles](../engineering.md#package-structure). `bun run gen package` creates a package; `bun run gen tool` creates a source-run internal tool.

- Output must pass shape and verification gates without manual fixups. Keep config/prompts/actions type-clean.
- Templates own handwritten source/manifest fields; shape tooling derives exports/files/sideEffects/scripts/preset dependencies. Package entries come from `build: PackageBuild` in `tsdown.config.ts`.
- Dependencies use `catalog:` or `workspace:*`, including peers. Tools have `src/`, colocated tests, the tool tsconfig, and no root source or `test/` folder.
- Client generation preserves neutral React/DOM-free `.`, per-module `"use client"`, DOM-free client compilation, DOM test project, and required peers/test deps. Client modules do not import the server barrel.
- Use `testConfig` for packages/tools and `appTestConfig` for apps. Explain necessary overrides. Keep Runtime primitives README guidance accurate.
- Preserve Handlebars/glob/extension stripping and final install/shape synchronization.

Validate generated server, client, and tool fixtures through the existing generator smoke workflow and [validate skill](../skills/validate/SKILL.md). Use an isolated owned fixture; do not create/delete a fixed `packages/scratch` path that could belong to someone else.
