import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { copyTemplate, targetName } from "./copy"

describe("targetName", () => {
  it("restores a leading underscore to a dot", () => {
    expect(targetName("_gitignore")).toBe(".gitignore")
    expect(targetName("_npmrc")).toBe(".npmrc")
  })

  it("leaves an ordinary name unchanged", () => {
    expect(targetName("package.json")).toBe("package.json")
    expect(targetName("tsconfig.json")).toBe("tsconfig.json")
  })
})

describe("copyTemplate", () => {
  let root: string
  let from: string
  let to: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "create-plainworks-copy-"))
    from = join(root, "template")
    to = join(root, "out")
    mkdirSync(join(from, "src"), { recursive: true })
    mkdirSync(join(from, "node_modules"), { recursive: true })
    writeFileSync(join(from, "_gitignore"), "node_modules\n")
    writeFileSync(join(from, "tsconfig.json"), "{}\n")
    writeFileSync(join(from, "package.json"), "{}\n")
    writeFileSync(join(from, "src", "app.ts"), "export const x = 1\n")
    writeFileSync(join(from, "node_modules", "junk.js"), "junk\n")
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it("copies files, restores dotfiles, and skips node_modules", () => {
    copyTemplate(from, to)
    const top = readdirSync(to).sort()
    expect(top).toContain(".gitignore")
    expect(top).toContain("tsconfig.json")
    expect(top).toContain("package.json")
    expect(top).toContain("src")
    expect(top).not.toContain("_gitignore")
    expect(top).not.toContain("node_modules")
    expect(readFileSync(join(to, "src", "app.ts"), "utf8")).toContain("export const x")
  })
})
