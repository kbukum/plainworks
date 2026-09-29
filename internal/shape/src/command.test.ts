import { memoryWorkspaceFiles } from "@plainworks/workspace"
import { describe, expect, it } from "vitest"
import { runShapeCommand } from "./command"
import { memoryConfigLoader, shapedBuilds, shapedRepo } from "./testing/repo"

async function run(
  args: string[],
  files = memoryWorkspaceFiles(shapedRepo()),
  builds = shapedBuilds(),
) {
  let stdout = ""
  let stderr = ""
  const code = await runShapeCommand(
    args,
    { files, configs: memoryConfigLoader(builds) },
    { stdout: (text) => (stdout += text), stderr: (text) => (stderr += text) },
  )
  return { code, stdout, stderr }
}

describe("runShapeCommand", () => {
  it("passes check on a shaped repository", async () => {
    expect(await run(["check"])).toEqual({
      code: 0,
      stdout: "Every workspace matches its profile.\n",
      stderr: "",
    })
  })

  it("fails check and lists each drift", async () => {
    const builds = shapedBuilds()
    builds["packages/std"] = { entry: { index: "src/index.ts", list: "src/list/index.ts" } }
    const { code, stderr } = await run(["check"], undefined, builds)
    expect(code).toBe(1)
    expect(stderr).toBe(
      'packages/std: package.json "exports" does not match the profile; run `bun run sync-shape`\n' +
        "1 shape issue.\n",
    )
  })

  it("syncs every workspace, or the named ones, and reports what it wrote", async () => {
    const builds = shapedBuilds()
    builds["packages/std"] = { entry: { index: "src/index.ts", list: "src/list/index.ts" } }
    const files = memoryWorkspaceFiles(shapedRepo())
    expect((await run(["sync", "packages/ui"], files, builds)).stdout).toBe("Nothing to sync.\n")
    expect(await run(["sync"], files, builds)).toEqual({
      code: 0,
      stdout: "Synced packages/std\n",
      stderr: "",
    })
  })

  it("reports a repository it cannot read as a failure, not a crash", async () => {
    const { code, stderr } = await run(["sync", "packages/nope"])
    expect(code).toBe(1)
    expect(stderr).toBe("packages/nope is not a workspace\n")
    const broken = memoryWorkspaceFiles({ "package.json": "{}" })
    expect((await run(["check"], broken)).code).toBe(1)
  })

  it("prints usage for an unknown command or stray argument", async () => {
    for (const args of [[], ["nope"], ["check", "extra"]]) {
      const { code, stderr } = await run(args)
      expect(code).toBe(2)
      expect(stderr).toContain("Usage:")
    }
  })

  it("rethrows an unexpected error", async () => {
    const files = {
      ...memoryWorkspaceFiles(shapedRepo()),
      listFiles: () => {
        throw new TypeError("disk on fire")
      },
    }
    await expect(run(["check"], files)).rejects.toThrow("disk on fire")
  })
})
