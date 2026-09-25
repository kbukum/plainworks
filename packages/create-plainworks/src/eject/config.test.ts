import { describe, expect, it } from "vitest"
import { EXAMPLE_SOURCE_APPS, isSkippedEntry, STANDALONE_TSCONFIG } from "./config"

// The config half of eject: which entries are dropped from an ejected project, and the standalone
// tsconfig that replaces the base-extending workspace one.

describe("isSkippedEntry", () => {
  it("skips dependency and build output", () => {
    for (const name of [
      "node_modules",
      "dist",
      "coverage",
      ".turbo",
      ".next",
      ".bundle-analysis",
    ]) {
      expect(isSkippedEntry(name)).toBe(true)
    }
  })

  it("skips the test suite and the workspace-only task/test config at the app root", () => {
    for (const name of ["test", "turbo.json", "vitest.config.ts", "next-env.d.ts"]) {
      expect(isSkippedEntry(name)).toBe(true)
    }
    expect(isSkippedEntry("page.test.tsx")).toBe(true)
    expect(isSkippedEntry("src/read.test.ts")).toBe(true)
    expect(isSkippedEntry("tsconfig.tsbuildinfo")).toBe(true)
  })

  it("keeps nested routes and modules that merely share a workspace-config name", () => {
    // Root-only names are dropped only at the root — a real nested `test` route or module survives.
    for (const path of [
      "src/app/test/page.tsx",
      "src/test/index.ts",
      "src/lib/turbo.json",
      "src/vitest.config.ts",
    ]) {
      expect(isSkippedEntry(path)).toBe(false)
    }
  })

  it("keeps source, config, and markers", () => {
    for (const name of ["src", "next.config.ts", "package.json", "tsconfig.json", ".gitignore"]) {
      expect(isSkippedEntry(name)).toBe(false)
    }
  })
})

describe("STANDALONE_TSCONFIG", () => {
  it("stands alone — no extends, DOM libs, Next plugin", () => {
    expect("extends" in STANDALONE_TSCONFIG).toBe(false)
    expect(STANDALONE_TSCONFIG.compilerOptions.lib).toContain("DOM")
    expect(STANDALONE_TSCONFIG.compilerOptions.plugins).toEqual([{ name: "next" }])
  })
})

describe("EXAMPLE_SOURCE_APPS", () => {
  it("maps the next host to its source app", () => {
    expect(EXAMPLE_SOURCE_APPS.next).toBe("next-host")
  })
})
