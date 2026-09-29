import { existsSync } from "node:fs"
import type { UserConfig } from "tsdown"
import { assertPackageBuild, type PackageBuild } from "./build.ts"

/**
 * The one build shape every plainworks package uses:
 *
 * - **ESM-only** (dual CJS/ESM is legacy).
 * - **`platform: "neutral"`** — no host assumptions (matches the "assume no host" charter) and,
 *   with `type: "module"`, yields plain `.js` / `.d.ts` output that the package `exports` map
 *   points at.
 * - **`unbundle`** keeps the source module graph 1:1 in `dist`, so a per-module `"use client"`
 *   directive is preserved on exactly the modules that declared it — the server `.` entry never
 *   gets a stray client banner.
 * - **`dts` via `isolatedDeclarations`** for fast, correct type emit.
 * - **Source maps** for both the JS and the declarations, so a debugger and an editor's "go to
 *   definition" land on the original `src` file, which the package ships alongside `dist`.
 * - **React and every `@plainworks/*` package are externalized** — they are peers/deps of the
 *   consumer, never inlined into a package's `dist`.
 */
export function preset(build: PackageBuild): UserConfig {
  assertPackageBuild(build)
  const copy = Object.values(build.assets ?? {}).flatMap((asset) =>
    "from" in asset ? [{ from: asset.from, to: "dist" }] : [],
  )
  return {
    entry: { ...build.entry },
    format: ["esm"],
    platform: "neutral",
    fixedExtension: false,
    sourcemap: true,
    dts: { sourcemap: true },
    // Point type emit at the real server project. A package whose sources split across server /
    // client / test projects makes its `tsconfig.json` a references-only "solution" file so the
    // editor routes each file to the right project; that solution file has no `compilerOptions`, so
    // tsdown's dts generator must read `tsconfig.src.json` instead. Single-project packages keep
    // only `tsconfig.json`, so fall back to tsdown's default resolution there.
    tsconfig: build.tsconfig ?? (existsSync("tsconfig.src.json") ? "tsconfig.src.json" : true),
    clean: true,
    unbundle: true,
    treeshake: true,
    outDir: "dist",
    ...(copy.length > 0 ? { copy } : {}),
    deps: {
      neverBundle: [/^react($|\/)/, /^react-dom($|\/)/, /^@plainworks\//],
    },
  }
}
