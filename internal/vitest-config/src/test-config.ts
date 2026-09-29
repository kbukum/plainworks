import type { ViteUserConfig } from "vitest/config"
import { type CoverageOptions, coverageConfig } from "./coverage.ts"
import { sourceConditions } from "./source.ts"

/** Options for {@link testConfig}. */
export interface TestOptions {
  /** Extra test globs beyond the colocated `src/**\/*.test.{ts,tsx}`. */
  readonly include?: readonly string[]
  readonly coverage?: CoverageOptions
}

/** Options for {@link appTestConfig}. */
export interface AppTestOptions {
  /** Extra test globs beyond the colocated `src/**\/*.test.{ts,tsx}`. */
  readonly include?: readonly string[]
}

const SOURCE_TESTS = ["src/**/*.test.ts", "src/**/*.test.tsx"]

// DOM tests that run axe and user-event can pass 5 s on a busy CI runner. The tests are
// deterministic, so the longer limit only guards against a hang; it never hides a failure.
const TEST_TIMEOUT_MS = 15_000

/**
 * The Vitest config for a package or internal tool. Tests import `@plainworks/*` from source, so
 * they need no build first, and coverage holds the shared floor. Tests run in `node`: the
 * server-safe `.` entry must prove it needs no DOM, and a client test opts into jsdom per file with
 * a `// @vitest-environment jsdom` docblock.
 */
export function testConfig(options: TestOptions = {}): ViteUserConfig {
  const conditions = sourceConditions()
  return {
    resolve: { conditions: conditions.client },
    ssr: { resolve: { conditions: conditions.server } },
    test: {
      environment: "node",
      testTimeout: TEST_TIMEOUT_MS,
      include: [...SOURCE_TESTS, ...(options.include ?? [])],
      coverage: coverageConfig(options.coverage),
    },
  }
}

/**
 * The Vitest config for a workspace that tests the built packages the way a consumer does: the
 * apps and the cross-package integration suite. `@plainworks/*` resolves to `dist`, and there is no
 * coverage threshold; their end-to-end flows protect behavior.
 */
export function appTestConfig(options: AppTestOptions = {}): ViteUserConfig {
  return {
    test: {
      environment: "node",
      testTimeout: TEST_TIMEOUT_MS,
      include: [...SOURCE_TESTS, ...(options.include ?? [])],
    },
  }
}
