import { EXAMPLE_SOURCE_APPS } from "../host"

export { EXAMPLE_SOURCE_APPS }

// The config half of the eject transform: the finite, explicit list of monorepo-only couplings a
// real workspace app carries that a standalone project cannot resolve, plus the standalone
// equivalents they are replaced with. A source app is a first-class `apps/*` member — it `extends`
// the repo's base `tsconfig`, runs under `turbo`, and is wired for `vitest` — none of which
// resolves outside the workspace. Eject drops the workspace-only config and writes a self-contained
// `tsconfig.json` in its place, so the generated project stands alone.

/** The only `tsconfig.extends` an ejectable app may use — the base config eject replaces inline. */
export const NEUTRALIZED_TSCONFIG_EXTENDS = "../../tsconfig.base.json"

// Entries never copied into a generated project. Build output (`node_modules`, `dist`, …) is
// dropped at any depth; the workspace-only task/test config (`test/`, `turbo.json`, …) is dropped
// only at the app root, so a real nested route like `src/app/test/page.tsx` survives. Per-file
// patterns (`*.test.ts(x)`, `*.tsbuildinfo`) are dropped at any depth.
const SKIP_ANY_DEPTH = new Set(["node_modules", "dist", "coverage", ".turbo", ".next"])
const SKIP_AT_ROOT = new Set(["test", "turbo.json", "vitest.config.ts", "next-env.d.ts"])

/** Whether an entry (by its path relative to the app root) is dropped from the ejected output. */
export function isSkippedEntry(relativePath: string): boolean {
  const segments = relativePath.split(/[/\\]/)
  const name = segments.at(-1) ?? relativePath
  if (SKIP_ANY_DEPTH.has(name)) return true
  if (segments.length === 1 && SKIP_AT_ROOT.has(name)) return true
  if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) return true
  if (name.endsWith(".tsbuildinfo")) return true
  return false
}

/**
 * The standalone `tsconfig.json` written into a generated project. It inlines the compiler options
 * a workspace app inherits from the repo base config (which resolves only inside the monorepo),
 * with the DOM libs, Node types, and Next plugin a Next host needs — so the ejected app typechecks
 * with no `extends` reaching outside it.
 */
export const STANDALONE_TSCONFIG = {
  compilerOptions: {
    target: "ES2023",
    lib: ["ES2023", "DOM", "DOM.Iterable"],
    module: "ESNext",
    moduleResolution: "bundler",
    moduleDetection: "force",
    jsx: "preserve",
    types: ["node"],
    plugins: [{ name: "next" }],
    allowJs: true,
    resolveJsonModule: true,
    isolatedModules: true,
    esModuleInterop: true,
    incremental: true,
    noEmit: true,
    strict: true,
    noUncheckedIndexedAccess: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
  },
  include: ["src", "next-env.d.ts", "next.config.ts", ".next/types/**/*.ts"],
  exclude: ["node_modules"],
} as const
