import { describe, expect, it } from "vitest"
import { appTestConfig, COVERAGE_FLOOR, SOURCE_CONDITION, testConfig } from "./index.ts"

describe("testConfig", () => {
  it("resolves @plainworks/* to source on both the client and server graphs", () => {
    const config = testConfig()
    expect(config.resolve?.conditions?.[0]).toBe(SOURCE_CONDITION)
    expect(config.ssr?.resolve?.conditions?.[0]).toBe(SOURCE_CONDITION)
  })

  it("runs colocated src tests in node with the coverage floor", () => {
    const { test } = testConfig()
    expect(test?.environment).toBe("node")
    expect(test?.include).toEqual(["src/**/*.test.ts", "src/**/*.test.tsx"])
    expect(test?.coverage).toMatchObject({
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    })
  })

  it("keeps tests, declarations, and re-export barrels out of coverage", () => {
    const coverage = testConfig().test?.coverage
    expect(coverage).toMatchObject({
      exclude: ["**/*.test.{ts,tsx}", "**/*.d.ts", "src/**/index.ts", "src/client.ts"],
    })
  })

  it("adds extra test and coverage globs after the defaults", () => {
    const { test } = testConfig({
      include: ["scripts/**/*.test.ts"],
      coverage: { include: ["scripts/**/*.ts"], exclude: ["scripts/cli.ts"] },
    })
    expect(test?.include).toEqual(["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"])
    expect(test?.coverage).toMatchObject({
      include: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
      // A test or declaration under `scripts/` is excluded like one under `src/`.
      exclude: expect.arrayContaining(["**/*.test.{ts,tsx}", "src/client.ts", "scripts/cli.ts"]),
    })
  })

  it("lets a workspace raise the floor", () => {
    const coverage = testConfig({ coverage: { threshold: 90 } }).test?.coverage
    expect(coverage).toMatchObject({
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
    })
  })

  it("never lets a workspace lower the floor", () => {
    expect(() => testConfig({ coverage: { threshold: COVERAGE_FLOOR - 1 } })).toThrow(RangeError)
  })
})

describe("appTestConfig", () => {
  it("resolves @plainworks/* to the built packages", () => {
    const config = appTestConfig()
    expect(config.resolve?.conditions ?? []).not.toContain(SOURCE_CONDITION)
    expect(config.ssr?.resolve?.conditions ?? []).not.toContain(SOURCE_CONDITION)
  })

  it("runs src tests in node with no coverage threshold", () => {
    const { test } = appTestConfig()
    expect(test?.environment).toBe("node")
    expect(test?.include).toEqual(["src/**/*.test.ts", "src/**/*.test.tsx"])
    expect(test?.coverage).toBeUndefined()
  })
})
