import { describe, expect, it } from "vitest"
import { compileGlob } from "./glob"

describe("compileGlob", () => {
  it.each([
    ["apps/showcase/src/routes/tasks/**", "apps/showcase/src/routes/tasks/board.tsx", true],
    ["apps/showcase/src/routes/tasks/**", "apps/showcase/src/routes/tasks/a/b.tsx", true],
    ["apps/showcase/src/routes/tasks/**", "apps/showcase/src/routes/task.tsx", false],
    ["packages/*/src/index.ts", "packages/ui/src/index.ts", true],
    ["packages/*/src/index.ts", "packages/ui/x/src/index.ts", false],
    ["**/*.md", "README.md", true],
    ["**/*.md", "docs/a/b.md", true],
    ["**/*.md", "docs/a/b.mdx", false],
    ["**/*.test.{ts,tsx}", "packages/ui/src/a.test.tsx", true],
    ["**/*.test.{ts,tsx}", "packages/ui/src/a.test.js", false],
    ["src/a?.ts", "src/ab.ts", true],
    ["src/a?.ts", "src/a/.ts", false],
    ["src/(x)+.ts", "src/(x)+.ts", true],
    ["src/(x)+.ts", "src/xx.ts", false],
    [".github/**", ".github/workflows/ci.yml", true],
  ])("%s matches %s: %s", (pattern, path, expected) => {
    expect(compileGlob(pattern).test(path)).toBe(expected)
  })
})
