import { describe, expect, it } from "vitest"
import { GATES } from "./gates"
import { type OutputTarget, parseVerifyArgs, runVerify, tailLines, type VerifyIo } from "./run"

function recorder(failOn?: string, log = "") {
  const ran: string[] = []
  const targets: OutputTarget[] = []
  let out = ""
  let clock = 0
  const io: VerifyIo = {
    run: (command, output) => {
      ran.push(command.join(" "))
      targets.push(output)
      clock += 500
      return command.join(" ") === failOn ? 1 : 0
    },
    read: () => log,
    logPath: (gate) => `/logs/${gate}.log`,
    now: () => clock,
    write: (text) => {
      out += text
    },
  }
  return { ran, targets, io, output: () => out }
}

describe("GATES", () => {
  it("lists every gate once, in the Definition-of-Done order", () => {
    expect(GATES.map((gate) => gate.name)).toEqual([
      "check-versions",
      "lint",
      "check-comments",
      "check-layer-map",
      "check-registry",
      "check-shape",
      "check-axe-coverage",
      "typecheck",
      "check-boundaries",
      "build",
      "test",
      "check-packaging",
      "check-production",
    ])
  })
})

describe("tailLines", () => {
  it("keeps the last lines, counts the rest, and ends with one newline", () => {
    expect(tailLines("a\nb\nc\n", 2)).toEqual({ text: "b\nc\n", dropped: 1 })
    expect(tailLines("a\nb\nc", 5)).toEqual({ text: "a\nb\nc\n", dropped: 0 })
  })

  it("keeps blank lines inside the output", () => {
    expect(tailLines("a\n\nb\n", 3)).toEqual({ text: "a\n\nb\n", dropped: 0 })
  })

  it("returns nothing for an empty log", () => {
    expect(tailLines("", 10)).toEqual({ text: "", dropped: 0 })
  })
})

describe("parseVerifyArgs", () => {
  it("collects both --filter forms", () => {
    expect(parseVerifyArgs(["--filter=@plainworks/std", "--filter", "...[origin/main]"])).toEqual({
      kind: "run",
      filters: ["@plainworks/std", "...[origin/main]"],
      verbose: false,
    })
  })

  it("reads --verbose alongside filters", () => {
    expect(parseVerifyArgs(["--verbose", "--filter=x"])).toEqual({
      kind: "run",
      filters: ["x"],
      verbose: true,
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
    expect(runVerify(["--filter=@plainworks/std"], rec.io)).toBe(0)
    expect(rec.ran).toEqual([
      "bun run check-versions",
      "bun run lint",
      "bun run check-comments",
      "bun run check-layer-map",
      "bun run check-registry",
      "bun run check-shape",
      "bun run check-axe-coverage",
      "turbo run typecheck --filter=@plainworks/std",
      "tsc -p turbo/generators/tsconfig.json",
      "bun run check-boundaries",
      "turbo run build --filter=@plainworks/std",
      "turbo run test --filter=@plainworks/std",
      "turbo run check-packaging --filter=@plainworks/std",
      "turbo run check-production --filter=@plainworks/std",
    ])
    expect(rec.output()).toContain("verify: all 13 gates passed")
  })

  it("prints one line per passing gate and sends output to the gate's log", () => {
    const rec = recorder()
    expect(runVerify([], rec.io)).toBe(0)
    expect(rec.output()).toContain("▶ lint … ok (0.5s)\n")
    expect(rec.output()).toContain("▶ typecheck … ok (1.0s)\n")
    expect(rec.targets[1]).toEqual({ kind: "log", path: "/logs/lint.log" })
  })

  it("prints a failing gate's log tail and path", () => {
    const lines = Array.from({ length: 205 }, (_, index) => `line ${index + 1}`).join("\n")
    const rec = recorder("turbo run build", lines)
    expect(runVerify([], rec.io)).toBe(1)
    const out = rec.output()
    expect(out).toContain("▶ build … failed (0.5s)\n… 5 earlier lines are in the log\nline 6\n")
    expect(out).toContain("line 205\nlog: /logs/build.log\n")
    expect(out).not.toContain("line 5\n")
  })

  it("prints only the log path when a failing gate left no output", () => {
    const rec = recorder("turbo run build")
    expect(runVerify([], rec.io)).toBe(1)
    expect(rec.output()).toContain("▶ build … failed (0.5s)\nlog: /logs/build.log\n")
  })

  it("streams to the terminal with --verbose", () => {
    const rec = recorder()
    expect(runVerify(["--verbose"], rec.io)).toBe(0)
    expect(rec.targets.every((target) => target.kind === "inherit")).toBe(true)
    expect(rec.output()).toContain("\n▶ lint\n")
    expect(rec.output()).not.toContain("… ok")
  })

  it("stops at the first failing gate and names it", () => {
    const rec = recorder("turbo run build")
    expect(runVerify([], rec.io)).toBe(1)
    expect(rec.ran.at(-1)).toBe("turbo run build")
    expect(rec.ran).not.toContain("turbo run test")
    expect(rec.output()).toContain("verify: build failed")
  })

  it("lists the gates without running them", () => {
    const rec = recorder()
    expect(runVerify(["--list"], rec.io)).toBe(0)
    expect(rec.ran).toEqual([])
    expect(rec.output()).toContain(" 1. check-versions")
    expect(rec.output()).toContain("13. check-production")
  })

  it("prints usage for unknown arguments", () => {
    const rec = recorder()
    expect(runVerify(["--nope"], rec.io)).toBe(2)
    expect(rec.output()).toContain("Usage:")
  })
})
