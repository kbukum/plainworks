import { describe, expect, it } from "vitest"
import { memoryPackTools as fakeTools } from "./memory-tools"
import { checkPackaging, packWorkspace } from "./pack"

describe("packWorkspace", () => {
  it("packs with Bun and writes the tarball with the source condition stripped", async () => {
    const tools = fakeTools()
    const { tarball, manifest } = await packWorkspace("packages/theme", "/out", tools)
    expect(tarball).toBe("/out/plainworks-theme-0.1.0.tgz")
    expect(manifest).not.toContain("@plainworks/source")
    expect(tools.calls).toEqual(["packages/theme$ bun pm pack --quiet --destination /tmp/raw"])
    const text = new TextDecoder().decode(tools.written.get(tarball))
    expect(text).toContain("package/package.json,package/dist/index.js|")
    expect(text).not.toContain("@plainworks/source")
  })

  it("fails when Bun cannot pack", async () => {
    const tools = fakeTools()
    tools.run = async () => ({ code: 1, output: "boom" })
    await expect(packWorkspace("packages/theme", "/out", tools)).rejects.toThrow(/boom/)
  })

  it("fails when the tarball has no manifest", async () => {
    const tools = fakeTools()
    tools.archive.read = async () => new Map()
    await expect(packWorkspace("packages/theme", "/out", tools)).rejects.toThrow(/package.json/)
  })
})

describe("checkPackaging", () => {
  it("runs publint and are-the-types-wrong over the published tarball", async () => {
    const tools = fakeTools()
    const result = await checkPackaging("packages/theme", tools)
    expect(result.code).toBe(0)
    expect(tools.calls.slice(1)).toEqual([
      "packages/theme$ publint --strict /tmp/raw/plainworks-theme-0.1.0.tgz",
      "packages/theme$ attw /tmp/raw/plainworks-theme-0.1.0.tgz --profile esm-only --exclude-entrypoints ./styles.css",
    ])
    expect(result.output).toBe("publint ok\nattw ok\n")
  })

  it("skips the types check for a package with no exports", async () => {
    const tools = fakeTools({ manifest: JSON.stringify({ name: "create-plainworks" }) })
    await checkPackaging("packages/create-plainworks", tools)
    expect(tools.calls.some((call) => call.includes("attw"))).toBe(false)
  })

  it("fails when either checker fails, and still runs both", async () => {
    const tools = fakeTools({ results: { publint: { code: 1, output: "bad files\n" } } })
    const result = await checkPackaging("packages/theme", tools)
    expect(result).toEqual({ code: 1, output: "bad files\nattw ok\n" })
  })
})
