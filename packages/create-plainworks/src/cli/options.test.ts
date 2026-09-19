import { describe, expect, it } from "vitest"
import {
  InvalidOptionError,
  parseScaffoldArgs,
  resolveOptions,
  validateHost,
  validateProjectName,
} from "./options"

describe("parseScaffoldArgs", () => {
  it("reads the project name positional and defaults the flags", () => {
    const parsed = parseScaffoldArgs(["my-app"])
    expect(parsed.positionals).toEqual(["my-app"])
    expect(parsed.install).toBe(true)
    expect(parsed.git).toBe(true)
    expect(parsed.yes).toBe(false)
    expect(parsed.host).toBeUndefined()
  })

  it("consumes --no-install and --no-git as negations", () => {
    const parsed = parseScaffoldArgs(["my-app", "--no-install", "--no-git"])
    expect(parsed.install).toBe(false)
    expect(parsed.git).toBe(false)
    expect(parsed.positionals).toEqual(["my-app"])
  })

  it("reads --host, --yes and -h", () => {
    const parsed = parseScaffoldArgs(["--host", "next", "--yes", "-h"])
    expect(parsed.host).toBe("next")
    expect(parsed.yes).toBe(true)
    expect(parsed.help).toBe(true)
  })
})

describe("validateProjectName", () => {
  it("accepts and trims a valid name", () => {
    expect(validateProjectName("  my-app ")).toBe("my-app")
  })

  it.each(["", "   ", "My-App", "my app", "-leading", "@scope/x"])("rejects %j", (name) => {
    expect(() => validateProjectName(name)).toThrow(InvalidOptionError)
  })
})

describe("validateHost", () => {
  it("accepts a known host", () => {
    expect(validateHost("next")).toBe("next")
  })

  it("rejects an unknown host", () => {
    expect(() => validateHost("svelte")).toThrow(InvalidOptionError)
  })
})

describe("resolveOptions", () => {
  const cwd = "/tmp/work"
  const failingPrompt = () => Promise.reject(new Error("prompt should not run"))

  it("resolves the target dir from a positional name", async () => {
    const options = await resolveOptions(parseScaffoldArgs(["my-app"]), {
      cwd,
      prompt: failingPrompt,
    })
    expect(options.projectName).toBe("my-app")
    expect(options.targetDir).toBe("/tmp/work/my-app")
    expect(options.host).toBe("next")
  })

  it("prompts for a missing name", async () => {
    const options = await resolveOptions(parseScaffoldArgs([]), {
      cwd,
      prompt: (_question, fallback) => Promise.resolve(fallback === "" ? "x" : "prompted-app"),
    })
    expect(options.projectName).toBe("prompted-app")
  })

  it("uses the default name under --yes without prompting", async () => {
    const options = await resolveOptions(parseScaffoldArgs(["--yes"]), {
      cwd,
      prompt: failingPrompt,
    })
    expect(options.projectName).toBe("plainworks-app")
  })

  it("validates an explicit --host", async () => {
    await expect(
      resolveOptions(parseScaffoldArgs(["my-app", "--host", "nope"]), {
        cwd,
        prompt: failingPrompt,
      }),
    ).rejects.toThrow(InvalidOptionError)
  })
})
