import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { kitSingletons, readKitCheckout } from "./checkout"
import { SourceLinkError } from "./errors"
import { resolveKitImport } from "./resolve"
import { type FixtureTree, KIT_FILES, writeTree } from "./testing"

let tree: FixtureTree | undefined
afterEach(() => tree?.remove())

function checkout() {
  tree = writeTree(KIT_FILES)
  return readKitCheckout(join(tree.root, "kit"))
}

describe("readKitCheckout", () => {
  it("reads only @plainworks packages", () => {
    expect([...checkout().packages.keys()].sort()).toEqual(["@plainworks/std", "@plainworks/ui"])
  })

  it("rejects a folder that is not a checkout", () => {
    tree = writeTree({ "empty/packages/x/README.md": "" })
    expect(() => readKitCheckout(join(tree?.root ?? "", "missing"))).toThrow(SourceLinkError)
    expect(() => readKitCheckout(join(tree?.root ?? "", "empty"))).toThrow(/No @plainworks/)
  })

  it("rejects an unreadable manifest instead of skipping it", () => {
    tree = writeTree({ "kit/packages/bad/package.json": "{" })
    expect(() => readKitCheckout(join(tree?.root ?? "", "kit"))).toThrow(/not valid JSON/)
    tree.remove()
    tree = writeTree({ "kit/packages/bad/package.json": { version: "1" } })
    expect(() => readKitCheckout(join(tree?.root ?? "", "kit"))).toThrow(/no package name/)
  })
})

describe("kitSingletons", () => {
  it("unions non-kit peers with the app's extras", () => {
    expect(kitSingletons(checkout(), { extra: ["react-dom", "react"] })).toEqual([
      "@tanstack/react-query",
      "react",
      "react-dom",
    ])
  })

  it("adds the kit's runtime dependencies the app has installed", () => {
    const isInstalled = (name: string) => name === "shared-dep" || name === "@plainworks/std"
    expect(kitSingletons(checkout(), { isInstalled })).toEqual([
      "@tanstack/react-query",
      "react",
      "shared-dep",
    ])
  })
})

describe("resolveKitImport", () => {
  it("prefers the source entry, then dist for vendored entries and generated assets", () => {
    const kit = checkout()
    const ui = kit.packages.get("@plainworks/ui")?.dir ?? ""
    expect(resolveKitImport(kit, "@plainworks/ui")).toBe(join(ui, "src/index.ts"))
    expect(resolveKitImport(kit, "@plainworks/ui/button")).toBe(join(ui, "dist/button.js"))
    expect(resolveKitImport(kit, "@plainworks/ui/styles.css")).toBe(join(ui, "src/styles.css"))
    expect(resolveKitImport(kit, "@plainworks/ui/tokens.css")).toBe(join(ui, "dist/tokens.css"))
  })

  it("leaves other imports to Vite", () => {
    const kit = checkout()
    expect(resolveKitImport(kit, "react")).toBeUndefined()
    expect(resolveKitImport(kit, "@plainworks/absent")).toBeUndefined()
  })

  it("rejects a subpath the package does not export", () => {
    expect(() => resolveKitImport(checkout(), "@plainworks/ui/nope")).toThrow(
      expect.objectContaining({ kind: "vite/subpath-unknown" }),
    )
  })

  it("reads string, conditions-only and fallback-array export maps", () => {
    const kit = (exports: unknown) => ({
      root: "/kit",
      packages: new Map([
        [
          "@plainworks/x",
          {
            name: "@plainworks/x",
            dir: "/kit/x",
            version: "1",
            exports,
            peers: [],
            dependencies: [],
          },
        ],
      ]),
    })
    expect(resolveKitImport(kit("./main.js"), "@plainworks/x")).toBe("/kit/x/main.js")
    expect(() => resolveKitImport(kit("./main.js"), "@plainworks/x/sub")).toThrow(SourceLinkError)
    expect(resolveKitImport(kit({ import: "./esm.js" }), "@plainworks/x")).toBe("/kit/x/esm.js")
    expect(() => resolveKitImport(kit({ import: "./esm.js" }), "@plainworks/x/a")).toThrow()
    expect(resolveKitImport(kit({ ".": [{ require: "./c.js" }, "./m.js"] }), "@plainworks/x")).toBe(
      "/kit/x/m.js",
    )
    expect(() => resolveKitImport(kit({ ".": [{ require: "./c.js" }] }), "@plainworks/x")).toThrow()
    expect(() => resolveKitImport(kit({ ".": 3 }), "@plainworks/x")).toThrow()
    expect(() => resolveKitImport(kit(undefined), "@plainworks/x")).toThrow()
  })
})
