import { describe, expect, it } from "vitest"
import { assertPackageBuild, BuildShapeError, renderFiles } from "./build.ts"

describe("assertPackageBuild", () => {
  it("accepts an index entry, subpath entries, and assets named after their file", () => {
    expect(() =>
      assertPackageBuild({
        entry: { index: "src/index.ts", "client/scope": "src/client/scope/index.ts" },
        assets: { "styles.css": { from: "src/styles.css" } },
      }),
    ).not.toThrow()
  })

  it("requires the index entry", () => {
    expect(() => assertPackageBuild({ entry: { client: "src/client.ts" } })).toThrow(
      BuildShapeError,
    )
  })

  it("rejects an entry key that is not a plain subpath", () => {
    for (const key of ["./client", "client/index", "Client", "client/"]) {
      expect(() =>
        assertPackageBuild({ entry: { index: "src/index.ts", [key]: "src/client.ts" } }),
      ).toThrow(/entry/)
    }
  })

  it("rejects an entry outside src", () => {
    expect(() => assertPackageBuild({ entry: { index: "lib/index.ts" } })).toThrow(/src/)
  })

  it("rejects a copied asset whose exported name differs from its file", () => {
    expect(() =>
      assertPackageBuild({
        entry: { index: "src/index.ts" },
        assets: { "theme.css": { from: "src/styles.css" } },
      }),
    ).toThrow(/theme\.css/)
  })
})

describe("renderFiles", () => {
  it("publishes the build, the source its maps point at, and declared extras", () => {
    expect(renderFiles({ entry: { index: "src/index.ts" }, files: ["registry.json"] })).toEqual([
      "dist",
      "src",
      "!src/**/*.test.*",
      "registry.json",
    ])
  })

  it("publishes only the build and extras for a command-line package", () => {
    expect(renderFiles({ bin: { create: "src/bin.ts" }, files: ["examples"] })).toEqual([
      "dist",
      "examples",
    ])
  })
})

describe("assertPackageBuild files", () => {
  it("rejects an extra that the shape already publishes", () => {
    expect(() => assertPackageBuild({ entry: { index: "src/index.ts" }, files: ["src"] })).toThrow(
      /already published/,
    )
  })
})
