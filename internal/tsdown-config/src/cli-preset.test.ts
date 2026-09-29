import { describe, expect, it } from "vitest"
import { BuildShapeError } from "./build.ts"
import { assertCliBuild, cliPreset, renderBin } from "./cli-preset.ts"

describe("cliPreset", () => {
  it("builds each command for Node, named after the command", () => {
    const config = cliPreset({ bin: { "create-plainworks": "src/bin.ts" } })
    expect(config).toMatchObject({
      entry: { "create-plainworks": "src/bin.ts" },
      format: ["esm"],
      platform: "node",
      sourcemap: true,
      dts: false,
      outDir: "dist",
    })
  })
})

describe("renderBin", () => {
  it("points each command at its built file", () => {
    expect(renderBin({ bin: { "create-plainworks": "src/bin.ts" } })).toEqual({
      "create-plainworks": "./dist/create-plainworks.js",
    })
  })
})

describe("assertCliBuild", () => {
  it("requires at least one command", () => {
    expect(() => assertCliBuild({ bin: {} })).toThrow(BuildShapeError)
  })

  it("rejects a command name that is not kebab-case", () => {
    expect(() => assertCliBuild({ bin: { Create: "src/bin.ts" } })).toThrow(/command/)
  })

  it("rejects a command built from outside src", () => {
    expect(() => assertCliBuild({ bin: { create: "scripts/bin.ts" } })).toThrow(/outside src/)
  })
})
