import { describe, expect, it } from "vitest"
import { memoryWorkspaceFiles } from "./memory-files"

const repo = () =>
  memoryWorkspaceFiles({
    "package.json": "{}",
    "packages/std/package.json": "{}",
    "packages/std/src/index.ts": "",
    "packages/http/tsconfig.json": "{}",
  })

describe("memoryWorkspaceFiles", () => {
  it("lists directories and files directly inside a path", () => {
    const files = repo()
    expect(files.listDirectories("packages")).toEqual(["http", "std"])
    expect(files.listDirectories("packages/std")).toEqual(["src"])
    expect(files.listFiles("packages/std")).toEqual(["package.json"])
    expect(files.listFiles("")).toEqual(["package.json"])
  })

  it("reads back what it writes", () => {
    const files = repo()
    files.writeText("packages/std/README.md", "hi")
    expect(files.readText("packages/std/README.md")).toBe("hi")
    expect(files.files.get("packages/std/README.md")).toBe("hi")
    expect(files.readText("missing")).toBeUndefined()
  })
})
