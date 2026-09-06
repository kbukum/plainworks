import type { UserConfig } from "tsdown"

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
}

/**
 * The one build shape every plainworks package uses:
 *
 * - **ESM-only** (dual CJS/ESM is legacy).
 * - **`platform: "neutral"`** — no host assumptions (matches the "assume no host" charter) and, with
 *   `type: "module"`, yields plain `.js` / `.d.ts` output that the package `exports` map points at.
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
    clean: true,
    unbundle: true,
    treeshake: true,
    outDir: "dist",
    deps: {
      neverBundle: [/^react($|\/)/, /^react-dom($|\/)/, /^@plainworks\//],
    },
  }
}
