import { describe, expect, it } from "vitest"
import { GATES } from "./gates"
import { type CommandRunner, parseVerifyArgs, runVerify } from "./run"

function recorder(failOn?: string) {
  const ran: string[] = []
  let out = ""
  const runner: CommandRunner = (command) => {
    ran.push(command.join(" "))
    return command.join(" ") === failOn ? 1 : 0
  }
  const write = (text: string) => {
    out += text
  }
  return { ran, runner, write, output: () => out }
}

describe("GATES", () => {
  it("lists every gate once, in the Definition-of-Done order", () => {
    expect(GATES.map((gate) => gate.name)).toEqual([
      "check-versions",
      "lint",
      "check-comments",
      "check-layer-map",
      "check-registry",
      "typecheck",
      "check-boundaries",
      "build",
      "test",
      "check-packaging",
      "check-production",
    ])
  })
})

describe("parseVerifyArgs", () => {
  it("collects both --filter forms", () => {
    expect(parseVerifyArgs(["--filter=@plainworks/std", "--filter", "...[origin/main]"])).toEqual({
      kind: "run",
      filters: ["@plainworks/std", "...[origin/main]"],
    })
  })

  it("reads --list and rejects anything else", () => {
    expect(parseVerifyArgs(["--list"])).toEqual({ kind: "list" })
    expect(parseVerifyArgs(["--filter"])).toEqual({ kind: "usage" })
    expect(parseVerifyArgs(["--filter="])).toEqual({ kind: "usage" })
    expect(parseVerifyArgs(["--list", "--filter=x"])).toEqual({ kind: "usage" })
    expect(parseVerifyArgs(["build"])).toEqual({ kind: "usage" })
  })
})

describe("runVerify", () => {
  it("runs every gate in order and forwards filters only to package gates", () => {
    const rec = recorder()
    expect(runVerify(["--filter=@plainworks/std"], rec.runner, rec.write)).toBe(0)
    expect(rec.ran).toEqual([
      "bun run check-versions",
      "bun run lint",
      "bun run check-comments",
      "bun run check-layer-map",
      "bun run check-registry",
      "turbo run typecheck --filter=@plainworks/std",
      "tsc -p turbo/generators/tsconfig.json",
      "bun run check-boundaries",
      "turbo run build --filter=@plainworks/std",
      "turbo run test --filter=@plainworks/std",
      "turbo run check-packaging --filter=@plainworks/std",
      "turbo run check-production --filter=@plainworks/std",
    ])
    expect(rec.output()).toContain("verify: all 11 gates passed")
  })

  it("stops at the first failing gate and names it", () => {
    const rec = recorder("turbo run build")
    expect(runVerify([], rec.runner, rec.write)).toBe(1)
    expect(rec.ran.at(-1)).toBe("turbo run build")
    expect(rec.ran).not.toContain("turbo run test")
    expect(rec.output()).toContain("verify: build failed")
  })

  it("lists the gates without running them", () => {
    const rec = recorder()
    expect(runVerify(["--list"], rec.runner, rec.write)).toBe(0)
    expect(rec.ran).toEqual([])
    expect(rec.output()).toContain(" 1. check-versions")
    expect(rec.output()).toContain("11. check-production")
  })

  it("prints usage for unknown arguments", () => {
    const rec = recorder()
    expect(runVerify(["--nope"], rec.runner, rec.write)).toBe(2)
    expect(rec.output()).toContain("Usage:")
  })
})
