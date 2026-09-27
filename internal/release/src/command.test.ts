import { describe, expect, it } from "vitest"
import { runReleaseCommand } from "./command"
import { memoryWorkspaceFiles } from "./workspace"

function repo(extra: Record<string, string> = {}) {
  return memoryWorkspaceFiles({
    "package.json": JSON.stringify({ workspaces: ["packages/*"] }),
    "packages/std/package.json": JSON.stringify({
      name: "@plainworks/std",
      version: "0.1.0-alpha.1",
    }),
    "packages/http/package.json": JSON.stringify({
      name: "@plainworks/http",
      version: "0.1.0-alpha.1",
      dependencies: { "@plainworks/std": "workspace:*" },
    }),
    ...extra,
  })
}

function run(args: readonly string[], files = repo()) {
  let stdout = ""
  let stderr = ""
  const code = runReleaseCommand(args, files, {
    stdout: (text) => {
      stdout += text
    },
    stderr: (text) => {
      stderr += text
    },
  })
  return { code, stdout, stderr }
}

const preOn = { ".changeset/pre.json": JSON.stringify({ mode: "pre", tag: "alpha" }) }

describe("runReleaseCommand", () => {
  it("prints the publish order as workspace dirs", () => {
    expect(run(["publish-set"])).toEqual({
      code: 0,
      stdout: "packages/std\npackages/http\n",
      stderr: "",
    })
  })

  it("prints the publish order as JSON", () => {
    const { code, stdout } = run(["publish-set", "--json"])
    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toEqual([
      { dir: "packages/std", name: "@plainworks/std", version: "0.1.0-alpha.1" },
      { dir: "packages/http", name: "@plainworks/http", version: "0.1.0-alpha.1" },
    ])
  })

  it("checks the publish set", () => {
    const { code, stderr } = run(["publish-set", "--check"])
    expect(code).toBe(0)
    expect(stderr).toContain("Publish set OK — 2 packages: @plainworks/std, @plainworks/http")
  })

  it("passes the release line check while pre mode matches", () => {
    const { code, stderr } = run(["check-line"], repo(preOn))
    expect(code).toBe(0)
    expect(stderr).toContain("Release line OK — alpha (pre)")
  })

  it("fails the release line check when pre mode is off on an alpha line", () => {
    const { code, stderr } = run(["check-line"])
    expect(code).toBe(1)
    expect(stderr).toContain("@plainworks/std is 0.1.0-alpha.1, but pre mode is off")
  })

  it("reports a release-tool error as a failed check", () => {
    const broken = repo({ ".changeset/pre.json": "{" })
    expect(run(["check-line"], broken)).toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/pre\.json/),
    })
  })

  it("rejects unknown commands and flags with usage", () => {
    for (const args of [[], ["publish"], ["publish-set", "--yaml"], ["check-line", "--x"]]) {
      const { code, stderr } = run(args)
      expect(code).toBe(2)
      expect(stderr).toContain("Usage:")
    }
    expect(run(["publish-set", "--json", "extra"]).code).toBe(2)
  })

  it("rethrows an unexpected error", () => {
    const files = {
      readText: () => {
        throw new TypeError("disk on fire")
      },
      listDirectories: () => [],
    }
    expect(() => run(["check-line"], files)).toThrow("disk on fire")
  })
})
