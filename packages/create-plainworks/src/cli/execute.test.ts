import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { CommandRunner } from "../scaffold/finalize"
import { defaultTemplateBaseDir, executeScaffold, HELP, nextSteps } from "./execute"

let root: string
let cwd: string
let templateBaseDir: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "create-plainworks-execute-"))
  cwd = join(root, "work")
  templateBaseDir = join(root, "examples")
  const nextTemplate = join(templateBaseDir, "next")
  mkdirSync(cwd, { recursive: true })
  mkdirSync(nextTemplate, { recursive: true })
  writeFileSync(
    join(nextTemplate, "package.json"),
    JSON.stringify({ name: "template", dependencies: { "@plainworks/std": "0.1.0" } }),
  )
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("executeScaffold", () => {
  it("prints help and returns 0 when --help is supplied", async () => {
    let output = ""
    const code = await executeScaffold(["--help"], {
      out: (t) => {
        output += t
      },
    })
    expect(code).toBe(0)
    expect(output).toBe(HELP)
  })

  it("runs full scaffold with install and git by default", async () => {
    let output = ""
    const executedCommands: Array<{ command: string; args: readonly string[]; cwd: string }> = []
    const runner: CommandRunner = (command, args, targetCwd) => {
      executedCommands.push({ command, args, cwd: targetCwd })
    }

    const code = await executeScaffold(["my-app", "--yes"], {
      cwd,
      templateBaseDir,
      packageManager: "npm",
      runner,
      out: (t) => {
        output += t
      },
    })

    expect(code).toBe(0)
    const targetDir = join(cwd, "my-app")
    const manifest = JSON.parse(readFileSync(join(targetDir, "package.json"), "utf8"))
    expect(manifest.name).toBe("my-app")
    expect(output).toContain("Next steps:")
    expect(output).toContain("cd my-app")
    expect(output).toContain("npm run dev")

    // Runner should have executed npm install and git init + add + commit
    expect(executedCommands).toHaveLength(4)
    expect(executedCommands[0]?.command).toBe("npm")
    expect(executedCommands[0]?.args).toEqual(["install"])
    expect(executedCommands[1]?.command).toBe("git")
    expect(executedCommands[1]?.args).toEqual(["init", "--quiet"])
    expect(executedCommands[2]?.command).toBe("git")
    expect(executedCommands[2]?.args).toEqual(["add", "-A"])
    expect(executedCommands[3]?.command).toBe("git")
  })

  it("skips install when --no-install is supplied", async () => {
    const executedCommands: Array<{ command: string; args: readonly string[] }> = []
    const runner: CommandRunner = (command, args) => {
      executedCommands.push({ command, args })
    }

    const code = await executeScaffold(["my-app", "--no-install", "--yes"], {
      cwd,
      templateBaseDir,
      packageManager: "bun",
      runner,
      out: () => {},
    })

    expect(code).toBe(0)
    expect(executedCommands).toHaveLength(3)
    expect(executedCommands.every((c) => c.command === "git")).toBe(true)
  })

  it("skips git when --no-git is supplied", async () => {
    const executedCommands: Array<{ command: string; args: readonly string[] }> = []
    const runner: CommandRunner = (command, args) => {
      executedCommands.push({ command, args })
    }

    const code = await executeScaffold(["my-app", "--no-git", "--yes"], {
      cwd,
      templateBaseDir,
      packageManager: "bun",
      runner,
      out: () => {},
    })

    expect(code).toBe(0)
    expect(executedCommands).toHaveLength(1)
    expect(executedCommands[0]?.command).toBe("bun")
  })

  it("handles errors and returns 1 when options are invalid", async () => {
    let errorOutput = ""
    const code = await executeScaffold(["Invalid Name!", "--yes"], {
      cwd,
      templateBaseDir,
      err: (t) => {
        errorOutput += t
      },
    })

    expect(code).toBe(1)
    expect(errorOutput).toContain("create-plainworks:")
  })
})

describe("nextSteps", () => {
  it("formats instructions tailored to the package manager without install when already installed", () => {
    const steps = nextSteps(
      { projectName: "app", targetDir: "/path/app", host: "next", install: true, git: true },
      "pnpm",
    )
    expect(steps).toContain("cd app")
    expect(steps).not.toContain("pnpm install")
    expect(steps).toContain("pnpm run dev")
  })

  it("includes install instruction when install was skipped", () => {
    const steps = nextSteps(
      { projectName: "app", targetDir: "/path/app", host: "next", install: false, git: true },
      "yarn",
    )
    expect(steps).toContain("yarn install")
    expect(steps).toContain("yarn run dev")
  })
})

describe("defaultTemplateBaseDir", () => {
  it("resolves an existing directory path", () => {
    const baseDir = defaultTemplateBaseDir()
    expect(baseDir).toContain("examples")
  })
})
