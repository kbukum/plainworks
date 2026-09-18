import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { generateProject, TargetDirectoryError } from "./generate"

const resolvers = {
  plainworksVersions: { "@plainworks/app": "0.1.0-alpha.1" },
  catalogVersions: { next: "^16.3.5" },
}

describe("generateProject", () => {
  let root: string
  let templateDir: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "create-plainworks-gen-"))
    templateDir = join(root, "template")
    mkdirSync(join(templateDir, "src"), { recursive: true })
    writeFileSync(
      join(templateDir, "package.json"),
      JSON.stringify({
        name: "@plainworks/next-host",
        dependencies: { "@plainworks/app": "workspace:*", next: "catalog:" },
      }),
    )
    writeFileSync(join(templateDir, "_gitignore"), "node_modules\n")
    writeFileSync(join(templateDir, "src", "page.tsx"), "export default () => null\n")
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it("copies the template and writes a standalone, pinned manifest", () => {
    const targetDir = join(root, "my-app")
    generateProject({ projectName: "my-app", targetDir, templateDir, ...resolvers })

    const manifest = JSON.parse(readFileSync(join(targetDir, "package.json"), "utf8"))
    expect(manifest.name).toBe("my-app")
    expect(manifest.dependencies).toEqual({ "@plainworks/app": "0.1.0-alpha.1", next: "^16.3.5" })
    expect(readFileSync(join(targetDir, ".gitignore"), "utf8")).toContain("node_modules")
    expect(readFileSync(join(targetDir, "src", "page.tsx"), "utf8")).toContain("export default")
  })

  it("generates into a fresh nested path", () => {
    const targetDir = join(root, "nested", "deep", "app")
    generateProject({ projectName: "app", targetDir, templateDir, ...resolvers })
    expect(readFileSync(join(targetDir, "package.json"), "utf8")).toContain('"name": "app"')
  })

  it("refuses a non-empty target directory", () => {
    const targetDir = join(root, "occupied")
    mkdirSync(targetDir, { recursive: true })
    writeFileSync(join(targetDir, "keep.txt"), "existing\n")

    expect(() =>
      generateProject({ projectName: "occupied", targetDir, templateDir, ...resolvers }),
    ).toThrow(TargetDirectoryError)
  })
})
