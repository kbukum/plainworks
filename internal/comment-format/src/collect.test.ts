import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { collectFiles } from "./collect"

const scratch = join(import.meta.dirname, "collect-fixture")

describe("source collector", () => {
  describe("collectFiles", () => {
    beforeEach(() => {
      rmSync(scratch, { recursive: true, force: true })
      mkdirSync(join(scratch, "src"), { recursive: true })
      mkdirSync(join(scratch, ".next", "types"), { recursive: true })
      writeFileSync(join(scratch, "src", "page.tsx"), "// authored\n")
      writeFileSync(join(scratch, ".next", "types", "generated.ts"), "// generated\n")
    })

    afterEach(() => {
      rmSync(scratch, { recursive: true, force: true })
    })

    test("collects authored sources but prunes the `.next` output tree", () => {
      const files = collectFiles(scratch)
      expect(files).toEqual([join(scratch, "src", "page.tsx")])
    })

    test("never descends into an excluded directory", () => {
      mkdirSync(join(scratch, ".next", "types", "deep"), { recursive: true })
      writeFileSync(join(scratch, ".next", "types", "deep", "route.ts"), "// generated\n")
      expect(collectFiles(scratch)).toEqual([join(scratch, "src", "page.tsx")])
    })

    test("prunes every generated or vendored directory by exact segment name", () => {
      for (const dir of [
        "node_modules",
        "dist",
        ".next",
        ".turbo",
        "coverage",
        "gen",
        "fixtures",
      ]) {
        mkdirSync(join(scratch, dir), { recursive: true })
        writeFileSync(join(scratch, dir, "generated.ts"), "// generated\n")
      }
      mkdirSync(join(scratch, "distribution"), { recursive: true })
      writeFileSync(join(scratch, "distribution", "authored.ts"), "// authored\n")

      expect(collectFiles(scratch).sort()).toEqual(
        [join(scratch, "distribution", "authored.ts"), join(scratch, "src", "page.tsx")].sort(),
      )
    })
  })
})
