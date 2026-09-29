import { describe, expect, it } from "vitest"
import { listWorkspaces, readJsonObject, WorkspaceError } from "./manifest"
import { memoryWorkspaceFiles } from "./memory-files"

const root = JSON.stringify({ workspaces: ["packages/*", "apps/*"] })

describe("listWorkspaces", () => {
  it("lists every workspace with a manifest, sorted by directory", () => {
    const files = memoryWorkspaceFiles({
      "package.json": root,
      "packages/std/package.json": JSON.stringify({ name: "@plainworks/std" }),
      "packages/http/package.json": JSON.stringify({ name: "@plainworks/http", private: true }),
      "apps/showcase/package.json": JSON.stringify({ name: "showcase" }),
      "apps/empty/README.md": "no manifest",
    })
    expect(listWorkspaces(files)).toEqual([
      { dir: "apps/showcase", manifest: { name: "showcase" } },
      { dir: "packages/http", manifest: { name: "@plainworks/http", private: true } },
      { dir: "packages/std", manifest: { name: "@plainworks/std" } },
    ])
  })

  it("rejects a workspace glob deeper than one level", () => {
    const files = memoryWorkspaceFiles({ "package.json": JSON.stringify({ workspaces: ["a/**"] }) })
    expect(() => listWorkspaces(files)).toThrow(WorkspaceError)
  })

  it("fails when the root manifest is missing or has no workspaces", () => {
    expect(() => listWorkspaces(memoryWorkspaceFiles({}))).toThrow(/package\.json/)
    const noWorkspaces = memoryWorkspaceFiles({ "package.json": "{}" })
    expect(() => listWorkspaces(noWorkspaces)).toThrow(/workspaces/)
  })
})

describe("readJsonObject", () => {
  it("returns undefined for a missing file", () => {
    expect(readJsonObject(memoryWorkspaceFiles({}), "a.json")).toBeUndefined()
  })

  it("names the file that is not valid JSON, keeping the parse error as the cause", () => {
    const files = memoryWorkspaceFiles({ "a.json": "{ nope" })
    let error: unknown
    try {
      readJsonObject(files, "a.json")
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(WorkspaceError)
    expect(error).toHaveProperty("message", expect.stringContaining("a.json"))
    expect(error).toHaveProperty("cause", expect.any(SyntaxError))
  })

  it("rejects JSON that is not an object", () => {
    expect(() => readJsonObject(memoryWorkspaceFiles({ "a.json": "[]" }), "a.json")).toThrow(
      /not a JSON object/,
    )
  })
})
