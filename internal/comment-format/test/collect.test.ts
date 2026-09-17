import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { collectFiles } from "../collect"

describe("source collector", () => {
  describe("collectFiles", () => {
    let root: string

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), "comment-format-"))
      mkdirSync(join(root, "src"), { recursive: true })
      mkdirSync(join(root, ".next", "types"), { recursive: true })
      writeFileSync(join(root, "src", "page.tsx"), "// authored\n")
      writeFileSync(join(root, ".next", "types", "generated.ts"), "// generated\n")
    })

    afterEach(() => {
      rmSync(root, { recursive: true, force: true })
    })

    test("collects authored sources but prunes the `.next` output tree", () => {
      const files = collectFiles(root)
      expect(files).toEqual([join(root, "src", "page.tsx")])
    })

    test("never descends into an excluded directory", () => {
      mkdirSync(join(root, ".next", "types", "deep"), { recursive: true })
      writeFileSync(join(root, ".next", "types", "deep", "route.ts"), "// generated\n")
      expect(collectFiles(root)).toEqual([join(root, "src", "page.tsx")])
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
        mkdirSync(join(root, dir), { recursive: true })
        writeFileSync(join(root, dir, "generated.ts"), "// generated\n")
      }
      mkdirSync(join(root, "distribution"), { recursive: true })
      writeFileSync(join(root, "distribution", "authored.ts"), "// authored\n")

      expect(collectFiles(root).sort()).toEqual(
        [join(root, "distribution", "authored.ts"), join(root, "src", "page.tsx")].sort(),
      )
    })
  })
})
