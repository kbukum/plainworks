import type { ViteUserConfig } from "vitest/config"

/** The lowest coverage threshold any package or tool may use. */
export const COVERAGE_FLOOR = 80

/** Coverage settings a workspace adds on top of the shared defaults. */
export interface CoverageOptions {
  /** Extra files to measure beyond `src`, such as typechecked build scripts. */
  readonly include?: readonly string[]
  /** Extra files to skip. Say why at the call site: each one lowers what the gate proves. */
  readonly exclude?: readonly string[]
  /** A higher floor for a security- or release-critical workspace. Never below 80. */
  readonly threshold?: number
}

type Coverage = NonNullable<NonNullable<ViteUserConfig["test"]>["coverage"]>

// Tests, declarations, and re-export-only barrels carry no logic to measure. Tests and
// declarations are skipped wherever they sit, since a workspace may measure `scripts/` too. Whether
// a `"use client"` directive survives into `dist` is proven by the CI dist check, not coverage.
const DEFAULT_EXCLUDE = ["**/*.test.{ts,tsx}", "**/*.d.ts", "src/**/index.ts", "src/client.ts"]

/** The v8 coverage block: `src` plus any extra globs, with every metric held to the threshold. */
export function coverageConfig(options: CoverageOptions = {}): Coverage {
  const threshold = options.threshold ?? COVERAGE_FLOOR
  if (threshold < COVERAGE_FLOOR) {
    throw new RangeError(
      `Coverage threshold ${threshold} is below the ${COVERAGE_FLOOR}% floor; raise the tests, not the gate.`,
    )
  }
  return {
    provider: "v8",
    include: ["src/**/*.{ts,tsx}", ...(options.include ?? [])],
    exclude: [...DEFAULT_EXCLUDE, ...(options.exclude ?? [])],
    thresholds: {
      lines: threshold,
      functions: threshold,
      branches: threshold,
      statements: threshold,
    },
  }
}
