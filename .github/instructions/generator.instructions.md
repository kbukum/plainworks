---
applyTo: "turbo/generators/**"
---

# Workspace generators

Follow [Code structure](../engineering.md#code-structure) and the [workspace profiles](../../docs/architecture.md#workspace-profiles). `bun run gen package` creates a package; `bun run gen tool` creates a source-run internal tool.

- Output passes the shape and verification gates with no manual fixups. Keep config, prompts, and actions type-clean.
- Templates own handwritten source and manifest fields; `sync-shape` derives `exports`, `files`, `sideEffects`, scripts, and preset dependencies from `build: PackageBuild` in `tsdown.config.ts`.
- Dependencies, including peers, use `catalog:` or `workspace:*`. Tools have `src/`, colocated tests, the tool tsconfig, and no root source or `test/` folder.
- Client generation keeps `.` free of React and DOM, puts `"use client"` per module, compiles client code DOM-free, adds the DOM test project and required peers, and never imports the server barrel from client modules.
- Packages and tools use `testConfig`; apps use `appTestConfig`. Explain any override. Keep the generated Runtime primitives README guidance accurate.
- Preserve Handlebars, glob, and extension stripping, and the final install and shape sync.

Prove server, client, and tool output with the generator smoke in the [validate skill](../skills/validate/SKILL.md#generator-smoke). Never create or delete a fixed path such as `packages/scratch` that could belong to someone else.
