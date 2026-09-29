import { describe, expect, it } from "vitest"
import { publishedManifest } from "./manifest"

describe("publishedManifest", () => {
  it("drops the source condition from every export and keeps the dist targets", () => {
    const text = JSON.stringify({
      name: "@plainworks/std",
      exports: {
        ".": {
          "@plainworks/source": "./src/index.ts",
          types: "./dist/index.d.ts",
          default: "./dist/index.js",
        },
        "./styles.css": "./dist/styles.css",
      },
    })
    expect(JSON.parse(publishedManifest(text))).toEqual({
      name: "@plainworks/std",
      exports: {
        ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
        "./styles.css": "./dist/styles.css",
      },
    })
  })

  it("drops the source condition inside fallback arrays and nested conditions", () => {
    const text = JSON.stringify({
      exports: {
        ".": [
          { "@plainworks/source": "./src/index.ts", default: "./dist/index.js" },
          "./dist/index.js",
        ],
        "./client": {
          browser: { "@plainworks/source": "./src/client.ts", default: "./dist/client.js" },
        },
      },
    })
    expect(JSON.parse(publishedManifest(text))).toEqual({
      exports: {
        ".": [{ default: "./dist/index.js" }, "./dist/index.js"],
        "./client": { browser: { default: "./dist/client.js" } },
      },
    })
  })

  it("leaves a manifest without exports as it is", () => {
    const text = `${JSON.stringify({ name: "create-plainworks", bin: { x: "./dist/x.js" } }, null, 2)}\n`
    expect(publishedManifest(text)).toBe(text)
  })

  it("keeps the two-space layout npm shows on the registry", () => {
    const text = JSON.stringify({
      exports: { ".": { "@plainworks/source": "./src/a.ts", default: "./dist/a.js" } },
    })
    expect(publishedManifest(text)).toBe(
      `${JSON.stringify({ exports: { ".": { default: "./dist/a.js" } } }, null, 2)}\n`,
    )
  })

  it("fails on a manifest that is not a JSON object", () => {
    expect(() => publishedManifest("[]")).toThrow(/package.json/)
  })
})
