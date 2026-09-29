import { memoryWorkspaceFiles } from "@plainworks/workspace"
import { describe, expect, it } from "vitest"
import { runReleaseCommand } from "./command"
import { memoryPackTools } from "./pack"

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

async function run(args: readonly string[], files = repo(), pack = memoryPackTools()) {
  let stdout = ""
  let stderr = ""
  const code = await runReleaseCommand(
    args,
    { files, pack },
    {
      stdout: (text) => {
        stdout += text
      },
      stderr: (text) => {
        stderr += text
      },
    },
  )
  return { code, stdout, stderr }
}

const preOn = { ".changeset/pre.json": JSON.stringify({ mode: "pre", tag: "alpha" }) }

describe("runReleaseCommand", () => {
  it("prints the publish order as workspace dirs", async () => {
    expect(await run(["publish-set"])).toEqual({
      code: 0,
      stdout: "packages/std\npackages/http\n",
      stderr: "",
    })
  })

  it("prints the publish order as JSON", async () => {
    const { code, stdout } = await run(["publish-set", "--json"])
    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toEqual([
      { dir: "packages/std", name: "@plainworks/std", version: "0.1.0-alpha.1" },
      { dir: "packages/http", name: "@plainworks/http", version: "0.1.0-alpha.1" },
    ])
  })

  it("checks the publish set", async () => {
    const { code, stderr } = await run(["publish-set", "--check"])
    expect(code).toBe(0)
    expect(stderr).toContain("Publish set OK — 2 packages: @plainworks/std, @plainworks/http")
  })

  it("passes the release line check while pre mode matches", async () => {
    const { code, stderr } = await run(["check-line"], repo(preOn))
    expect(code).toBe(0)
    expect(stderr).toContain("Release line OK — alpha (pre)")
  })

  it("fails the release line check when pre mode is off on an alpha line", async () => {
    const { code, stderr } = await run(["check-line"])
    expect(code).toBe(1)
    expect(stderr).toContain("@plainworks/std is 0.1.0-alpha.1, but pre mode is off")
  })

  it("reports a release-tool error as a failed check", async () => {
    const broken = repo({ ".changeset/pre.json": "{" })
    expect(await run(["check-line"], broken)).toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/pre\.json/),
    })
  })

  it("rejects unknown commands and flags with usage", async () => {
    for (const args of [
      [],
      ["publish"],
      ["publish-set", "--yaml"],
      ["check-line", "--x"],
      ["pack"],
      ["pack", "packages/theme", "--to"],
      ["check-packaging", "a", "b"],
    ]) {
      const { code, stderr } = await run(args)
      expect(code).toBe(2)
      expect(stderr).toContain("Usage:")
    }
    expect((await run(["publish-set", "--json", "extra"])).code).toBe(2)
  })

  it("rethrows an unexpected error", async () => {
    const files = {
      ...memoryWorkspaceFiles({}),
      readText: () => {
        throw new TypeError("disk on fire")
      },
    }
    await expect(run(["check-line"], files)).rejects.toThrow("disk on fire")
  })

  it("packs a workspace and prints the published tarball", async () => {
    const pack = memoryPackTools()
    const { code, stdout } = await run(
      ["pack", "packages/theme", "--destination", "/out"],
      repo(),
      pack,
    )
    expect(code).toBe(0)
    expect(stdout).toBe("/out/plainworks-theme-0.1.0.tgz\n")
  })

  it("packs into a scratch directory when no destination is given", async () => {
    const { stdout } = await run(["pack", "packages/theme"])
    expect(stdout).toBe("/tmp/raw/plainworks-theme-0.1.0.tgz\n")
  })

  it("checks packaging of the current directory by default", async () => {
    const pack = memoryPackTools()
    const { code, stdout } = await run(["check-packaging"], repo(), pack)
    expect(code).toBe(0)
    expect(stdout).toBe("publint ok\nattw ok\n")
    expect(pack.calls[0]).toMatch(/^\.\$ bun pm pack/)
  })

  it("fails the packaging check when a checker fails", async () => {
    const pack = memoryPackTools({ results: { attw: { code: 1, output: "no types\n" } } })
    const { code, stdout } = await run(["check-packaging", "packages/theme"], repo(), pack)
    expect(code).toBe(1)
    expect(stdout).toContain("no types")
  })
})
