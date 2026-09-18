import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { PackageManifest } from "../scaffold/manifest"
import { bundleExample } from "./bundle"

// The build-time eject turns a gated source app into the standalone example payload: it drops build
// output, the test suite, and the workspace-only task/test config, writes the inline standalone
// tsconfig and the lean starter manifest, and renames `.gitignore` to the `_gitignore` marker.

let root: string
let repoRoot: string
let appDir: string
let destDir: string

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function writeText(path: string, contents: string): void {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, contents)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "create-plainworks-bundle-"))
  repoRoot = join(root, "repo")
  appDir = join(repoRoot, "apps", "next-host")
  destDir = join(root, "out", "next")
  writeJson(join(repoRoot, "packages", "ui", "package.json"), {
    name: "@plainworks/ui",
    version: "1.0.0",
  })
  writeJson(join(appDir, "package.json"), {
    name: "@plainworks/next-host",
    private: true,
    scripts: { build: "next build", test: "vitest run" },
    dependencies: { "@plainworks/ui": "workspace:*" },
    devDependencies: { vitest: "catalog:", typescript: "catalog:" },
  })
  writeJson(join(appDir, "tsconfig.json"), {
    extends: "../../tsconfig.base.json",
    compilerOptions: { paths: {} },
  })
  writeJson(join(appDir, "turbo.json"), { extends: ["//"] })
  writeText(join(appDir, "vitest.config.ts"), "export default {}\n")
  writeText(join(appDir, ".gitignore"), "/.next/\n")
  writeText(join(appDir, "src", "page.tsx"), 'import { Button } from "@plainworks/ui/client"\n')
  writeText(join(appDir, "src", "page.test.tsx"), "// test\n")
  writeText(join(appDir, "test", "stub.ts"), "export {}\n")
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("bundleExample", () => {
  it("writes the inline standalone tsconfig with no extends", () => {
    bundleExample({ appDir, destDir, repoRoot })
    const tsconfig = JSON.parse(readFileSync(join(destDir, "tsconfig.json"), "utf8"))
    expect(tsconfig.extends).toBeUndefined()
    expect(tsconfig.compilerOptions.jsx).toBe("preserve")
  })

  it("writes the lean starter manifest, dropping test wiring", () => {
    bundleExample({ appDir, destDir, repoRoot })
    const manifest = JSON.parse(
      readFileSync(join(destDir, "package.json"), "utf8"),
    ) as PackageManifest
    expect(manifest.name).toBe("plainworks-app")
    expect((manifest.scripts as Record<string, string>).test).toBeUndefined()
    expect(manifest.devDependencies?.vitest).toBeUndefined()
    expect(manifest.dependencies?.["@plainworks/ui"]).toBe("workspace:*")
  })

  it("renames .gitignore to the _gitignore marker", () => {
    bundleExample({ appDir, destDir, repoRoot })
    expect(existsSync(join(destDir, "_gitignore"))).toBe(true)
    expect(existsSync(join(destDir, ".gitignore"))).toBe(false)
  })

  it("drops the test suite and the workspace-only task/test config", () => {
    bundleExample({ appDir, destDir, repoRoot })
    expect(existsSync(join(destDir, "turbo.json"))).toBe(false)
    expect(existsSync(join(destDir, "vitest.config.ts"))).toBe(false)
    expect(existsSync(join(destDir, "test"))).toBe(false)
    expect(existsSync(join(destDir, "src", "page.test.tsx"))).toBe(false)
    expect(existsSync(join(destDir, "src", "page.tsx"))).toBe(true)
  })

  it("regenerates a clean destination on each run", () => {
    mkdirSync(destDir, { recursive: true })
    writeFileSync(join(destDir, "stale.txt"), "old")
    bundleExample({ appDir, destDir, repoRoot })
    expect(readdirSync(destDir)).not.toContain("stale.txt")
  })

  it("refuses to bundle an app with an un-neutralized coupling", () => {
    writeJson(join(appDir, "package.json"), {
      name: "@plainworks/next-starter",
      dependencies: { "@plainworks/internal": "workspace:*" },
    })
    writeJson(join(repoRoot, "packages", "internal", "package.json"), {
      name: "@plainworks/internal",
      version: "1.0.0",
      private: true,
    })
    expect(() => bundleExample({ appDir, destDir, repoRoot })).toThrow()
  })
})
