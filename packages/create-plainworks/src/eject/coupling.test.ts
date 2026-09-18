import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { assertEjectable, EjectCouplingError } from "./coupling"

// The ejectability gate proves a source app couples to the monorepo only through the channels eject
// neutralizes. Each fixture below introduces one un-neutralized coupling and asserts the gate
// rejects it, and a clean fixture passes.

let root: string
let repoRoot: string
let appDir: string

/** Write a JSON file, creating parent directories. */
function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

/** Write a source file, creating parent directories. */
function writeSource(path: string, contents: string): void {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, contents)
}

/** A published package in the fixture repo. */
function publishPackage(name: string, dir: string): void {
  writeJson(join(repoRoot, "packages", dir, "package.json"), { name, version: "1.0.0" })
}

/** A private/internal package in the fixture repo (no published version). */
function privatePackage(name: string, dir: string): void {
  writeJson(join(repoRoot, "packages", dir, "package.json"), {
    name,
    version: "1.0.0",
    private: true,
  })
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "create-plainworks-eject-"))
  repoRoot = join(root, "repo")
  appDir = join(repoRoot, "apps", "next-host")
  publishPackage("@plainworks/ui", "ui")
  privatePackage("@plainworks/demo", "demo")
  writeJson(join(appDir, "package.json"), {
    name: "@plainworks/next-host",
    private: true,
    dependencies: { "@plainworks/ui": "workspace:*", next: "catalog:" },
    devDependencies: { typescript: "catalog:" },
  })
  writeJson(join(appDir, "tsconfig.json"), {
    extends: "../../tsconfig.base.json",
    compilerOptions: { paths: {} },
  })
  writeSource(join(appDir, "src", "page.tsx"), 'import { Button } from "@plainworks/ui/client"\n')
  writeSource(join(appDir, "src", "neutral", "local.ts"), 'import { x } from "../page"\n')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("assertEjectable", () => {
  it("passes a clean app coupling only through neutralized channels", () => {
    expect(() => assertEjectable({ appDir, repoRoot })).not.toThrow()
  })

  it("rejects a dependency on a private/internal @plainworks package", () => {
    writeJson(join(appDir, "package.json"), {
      name: "@plainworks/next-starter",
      dependencies: { "@plainworks/demo": "workspace:*" },
    })
    expect(() => assertEjectable({ appDir, repoRoot })).toThrow(EjectCouplingError)
  })

  it("rejects a source import that resolves outside the app directory", () => {
    writeSource(join(appDir, "src", "escape.ts"), 'import { z } from "../../../packages/ui/src"\n')
    expect(() => assertEjectable({ appDir, repoRoot })).toThrow(/resolves outside the app/)
  })

  it("rejects an @plainworks import that is not a declared dependency", () => {
    writeSource(join(appDir, "src", "extra.ts"), 'import { q } from "@plainworks/query"\n')
    expect(() => assertEjectable({ appDir, repoRoot })).toThrow(/not a declared dependency/)
  })

  it("rejects an undeclared third-party import", () => {
    writeSource(join(appDir, "src", "extra.ts"), 'import { z } from "zod"\n')
    expect(() => assertEjectable({ appDir, repoRoot })).toThrow(/not a declared dependency/)
  })

  it("allows node built-in imports without declaring them in package.json", () => {
    writeSource(
      join(appDir, "src", "node-import.ts"),
      'import { join } from "node:path"\nimport fs from "fs"\n',
    )
    expect(() => assertEjectable({ appDir, repoRoot })).not.toThrow()
  })

  it("tolerates comments and trailing commas in tsconfig.json", () => {
    writeSource(
      join(appDir, "tsconfig.json"),
      `{\n  // Base config to extend\n  "extends": "../../tsconfig.base.json",\n  "compilerOptions": { "paths": {}, },\n}\n`,
    )
    expect(() => assertEjectable({ appDir, repoRoot })).not.toThrow()
  })

  it("rejects a side-effect import that resolves outside the app directory", () => {
    // A bare `import "..."` has no binding, so the old regex missed it; the parser catches it.
    writeSource(join(appDir, "src", "side.ts"), 'import "../../../packages/ui/src/reset.css"\n')
    expect(() => assertEjectable({ appDir, repoRoot })).toThrow(/resolves outside the app/)
  })

  it("validates root config modules, not only src", () => {
    // `next.config.ts`/`postcss.config.mjs` live at the app root; they are scanned too.
    writeSource(join(appDir, "next.config.ts"), 'import "../../packages/ui/tailwind.preset"\n')
    expect(() => assertEjectable({ appDir, repoRoot })).toThrow(/resolves outside the app/)
  })

  it("rejects a tsconfig that extends something other than the neutralized base", () => {
    writeJson(join(appDir, "tsconfig.json"), { extends: "../../tsconfig.other.json" })
    expect(() => assertEjectable({ appDir, repoRoot })).toThrow(/only neutralizes/)
  })

  it("rejects a tsconfig that declares project references", () => {
    writeJson(join(appDir, "tsconfig.json"), {
      extends: "../../tsconfig.base.json",
      references: [{ path: "../other" }],
    })
    expect(() => assertEjectable({ appDir, repoRoot })).toThrow(/project references/)
  })

  it("rejects a tsconfig that aliases workspace source through paths", () => {
    writeJson(join(appDir, "tsconfig.json"), {
      extends: "../../tsconfig.base.json",
      compilerOptions: { paths: { "@plainworks/*": ["../../packages/*/src"] } },
    })
    expect(() => assertEjectable({ appDir, repoRoot })).toThrow(/compilerOptions.paths/)
  })
})
