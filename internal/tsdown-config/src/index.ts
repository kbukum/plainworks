import { existsSync } from "node:fs"
import type { CopyOptions, UserConfig } from "tsdown"

/**
 * Options for the shared plainworks build preset.
 */
export interface PresetOptions {
  /**
   * Entry points. Defaults to a single server-safe `src/index.ts`.
   *
   * Packages with an interactive client surface add a second `"use client"` entry, e.g.
   * `{ index: "src/index.ts", client: "src/client.ts" }`, which tsdown emits as `./client`.
   */
  entry?: string[] | Record<string, string>

  /**
   * Static assets to copy verbatim into `dist`. tsdown has no CSS pipeline, so a package that ships
   * a Tailwind-source stylesheet copies it here (e.g. `[{ from: "src/styles.css", to: "dist" }]`)
   * instead of exporting it from `src`. Every published entrypoint then resolves from the build
   * output and is covered by the packaging gate.
   */
  copy?: CopyOptions

  /**
   * The project declarations are emitted from. Defaults to `tsconfig.src.json` when present, else
   * tsdown's own resolution. A project with `isolatedDeclarations` emits through Oxc; one without
   * it emits through tsc, for sources that cannot carry explicit annotations (vendored code).
   */
  tsconfig?: string
}

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
 * - **React and every `@plainworks/*` package are externalized** — they are peers/deps of the
 *   consumer, never inlined into a package's `dist`.
 */
export function preset(options: PresetOptions = {}): UserConfig {
  return {
    entry: options.entry ?? ["src/index.ts"],
    format: ["esm"],
    platform: "neutral",
    fixedExtension: false,
    dts: true,
    // Point type emit at the real server project. A package whose sources split across server /
    // client / test projects makes its `tsconfig.json` a references-only "solution" file so the
    // editor routes each file to the right project; that solution file has no `compilerOptions`, so
    // tsdown's dts generator must read `tsconfig.src.json` instead. Single-project packages keep
    // only `tsconfig.json`, so fall back to tsdown's default resolution there.
    tsconfig: options.tsconfig ?? (existsSync("tsconfig.src.json") ? "tsconfig.src.json" : true),
    clean: true,
    unbundle: true,
    treeshake: true,
    outDir: "dist",
    ...(options.copy !== undefined ? { copy: options.copy } : {}),
    deps: {
      neverBundle: [/^react($|\/)/, /^react-dom($|\/)/, /^@plainworks\//],
    },
  }
}
