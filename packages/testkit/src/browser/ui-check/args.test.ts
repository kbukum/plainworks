import { describe, expect, it } from "vitest"
import { parseUiCheckArgs } from "./args"
import { UiCheckError } from "./errors"

describe("parseUiCheckArgs", () => {
  it("runs every flow at quick, with the default review, when given nothing", () => {
    expect(parseUiCheckArgs([])).toEqual({
      command: "check",
      select: { by: "all" },
      preset: "quick",
      diff: true,
    })
  })

  it("reads every check flag, in either --flag value or --flag=value form", () => {
    expect(
      parseUiCheckArgs(["--flow", "create-task, tasks", "--preset=themes", "--save-as", "before"]),
    ).toEqual({
      command: "check",
      select: { by: "named", flows: ["create-task", "tasks"] },
      preset: "themes",
      saveAs: "before",
      diff: true,
    })
    expect(parseUiCheckArgs(["--affected", "--base=origin/main"])).toEqual({
      command: "check",
      select: { by: "affected" },
      preset: "quick",
      base: "origin/main",
      diff: true,
    })
    expect(parseUiCheckArgs(["--no-diff"])).toMatchObject({ diff: false })
  })

  it("reads the serve and help commands", () => {
    expect(parseUiCheckArgs(["serve"])).toEqual({ command: "serve" })
    expect(parseUiCheckArgs(["--help"])).toEqual({ command: "help" })
    expect(parseUiCheckArgs(["-h"])).toEqual({ command: "help" })
  })

  it.each([
    [["--bogus"], /--bogus/],
    [["--affected", "--flow", "a"], /either --affected or --flow/],
    [["--flow", " , "], /--flow needs at least one flow name/],
    [["--preset", "huge"], /Unknown preset "huge"/],
    [["--save-as", "../x"], /--save-as needs a lowercase slug/],
    [["--base", "main", "--no-diff"], /--base compares, --no-diff skips/],
    [["serve", "--affected"], /serve takes no flags/],
    [["extra"], /Unexpected argument "extra"/],
  ])("rejects %j with a usage error", (argv, message) => {
    let thrown: unknown
    try {
      parseUiCheckArgs(argv)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(UiCheckError)
    expect(thrown).toMatchObject({ kind: "usage", message: expect.stringMatching(message) })
  })
})
