import { describe, expect, it } from "vitest"
import { parseUiCaptureArgs } from "./args"
import { UiCaptureError } from "./errors"

describe("parseUiCaptureArgs", () => {
  it("captures every flow at quick, comparing nothing, when given nothing", () => {
    expect(parseUiCaptureArgs([])).toEqual({
      command: "capture",
      select: { by: "all" },
      preset: "quick",
    })
  })

  it("reads every capture flag, in either --flag value or --flag=value form", () => {
    expect(
      parseUiCaptureArgs([
        "--flow",
        "create-task, tasks",
        "--preset=themes",
        "--save-as",
        "before",
      ]),
    ).toEqual({
      command: "capture",
      select: { by: "named", flows: ["create-task", "tasks"] },
      preset: "themes",
      saveAs: "before",
    })
    expect(parseUiCaptureArgs(["--affected", "--base=origin/main"])).toEqual({
      command: "capture",
      select: { by: "affected" },
      preset: "quick",
      base: "origin/main",
    })
  })

  it("reads the serve and help commands", () => {
    expect(parseUiCaptureArgs(["serve"])).toEqual({ command: "serve", explore: false })
    expect(parseUiCaptureArgs(["serve", "--explore"])).toEqual({ command: "serve", explore: true })
    expect(parseUiCaptureArgs(["--help"])).toEqual({ command: "help" })
    expect(parseUiCaptureArgs(["-h"])).toEqual({ command: "help" })
  })

  it("reads --docs as a capture of the docs flows at quick", () => {
    expect(parseUiCaptureArgs(["--docs"])).toEqual({
      command: "capture",
      select: { by: "docs" },
      preset: "quick",
    })
  })

  it.each([
    [["--bogus"], /--bogus/],
    [["--affected", "--flow", "a"], /either --affected or --flow/],
    [["--flow", " , "], /--flow needs at least one flow name/],
    [["--preset", "huge"], /Unknown preset "huge"/],
    [["--save-as", "../x"], /--save-as needs a lowercase slug/],
    [["--no-diff"], /--no-diff/],
    [["serve", "--affected"], /serve takes no flags/],
    [["--explore"], /--explore is only valid with serve/],
    [["extra"], /Unexpected argument "extra"/],
    [["--docs", "--flow", "a"], /--docs takes no other flag/],
    [["--docs", "--affected"], /--docs takes no other flag/],
    [["--docs", "--base", "main"], /--docs takes no other flag/],
    [["--docs", "--save-as", "before"], /--docs takes no other flag/],
    [["--docs", "--preset", "themes"], /--docs takes no other flag/],
  ])("rejects %j with a usage error", (argv, message) => {
    let thrown: unknown
    try {
      parseUiCaptureArgs(argv)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(UiCaptureError)
    expect(thrown).toMatchObject({ kind: "usage", message: expect.stringMatching(message) })
  })
})
