import { describe, expect, it } from "vitest"
import { renderExports } from "./exports.ts"

describe("renderExports", () => {
  it("maps each entry to source for the repo and to dist for everyone else", () => {
    expect(
      renderExports({
        entry: { index: "src/index.ts", "client/scope": "src/client/scope/index.ts" },
      }),
    ).toEqual({
      ".": {
        "@plainworks/source": "./src/index.ts",
        types: "./dist/index.d.ts",
        default: "./dist/index.js",
      },
      "./client/scope": {
        "@plainworks/source": "./src/client/scope/index.ts",
        types: "./dist/client/scope.d.ts",
        default: "./dist/client/scope.js",
      },
    })
  })

  it("exports each asset from dist", () => {
    const exports = renderExports({
      entry: { index: "src/index.ts" },
      assets: { "styles.css": { from: "src/styles.css" }, "extra.css": { generatedBy: "x.ts" } },
    })
    expect(exports["./styles.css"]).toBe("./dist/styles.css")
    expect(exports["./extra.css"]).toBe("./dist/extra.css")
  })

  it("resolves vendored entries to dist even in the repo", () => {
    const exports = renderExports({
      entry: { index: "src/index.ts", button: "src/shadcn/button.tsx" },
      vendored: "src/shadcn",
    })
    expect(exports["./button"]).toEqual({
      types: "./dist/button.d.ts",
      default: "./dist/button.js",
    })
    expect(exports["."]).toHaveProperty(["@plainworks/source"], "./src/index.ts")
  })
})
