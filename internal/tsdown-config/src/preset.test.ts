import { describe, expect, it } from "vitest"
import { preset } from "./preset.ts"

describe("preset", () => {
  it("builds every entry as ESM with JS and declaration source maps", () => {
    const config = preset({ entry: { index: "src/index.ts", client: "src/client.ts" } })
    expect(config).toMatchObject({
      entry: { index: "src/index.ts", client: "src/client.ts" },
      format: ["esm"],
      platform: "neutral",
      unbundle: true,
      sourcemap: true,
      dts: { sourcemap: true },
      outDir: "dist",
    })
  })

  it("copies each copied asset into dist under its exported name", () => {
    const config = preset({
      entry: { index: "src/index.ts" },
      assets: {
        "styles.css": { from: "src/styles.css" },
        "tokens.css": { from: "src/tokens.css" },
      },
    })
    expect(config.copy).toEqual([
      { from: "src/styles.css", to: "dist" },
      { from: "src/tokens.css", to: "dist" },
    ])
  })

  it("leaves a generated asset to the package's own build step", () => {
    const config = preset({
      entry: { index: "src/index.ts" },
      assets: { "styles.css": { generatedBy: "scripts/styles/cli.ts" } },
    })
    expect(config.copy).toBeUndefined()
  })

  it("uses the given declaration project", () => {
    const config = preset({ entry: { index: "src/index.ts" }, tsconfig: "tsconfig.shadcn.json" })
    expect(config.tsconfig).toBe("tsconfig.shadcn.json")
  })

  it("keeps React and every @plainworks package external", () => {
    const neverBundle = preset({ entry: { index: "src/index.ts" } }).deps?.neverBundle
    const [react, reactDom, kit] = Array.isArray(neverBundle) ? (neverBundle as RegExp[]) : []
    expect(react?.test("react/jsx-runtime")).toBe(true)
    expect(reactDom?.test("react-dom/client")).toBe(true)
    expect(kit?.test("@plainworks/std/web")).toBe(true)
  })
})
