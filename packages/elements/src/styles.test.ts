import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Contract test for the published stylesheet: in an installed app its `@import`/`@source`
// specifiers resolve relative to this file inside node_modules, so the manifest must declare
// every imported package and publish every scanned path. A bare `@import` that is not a declared
// dependency, or a `@source` escaping the package, breaks the consumer's build — pin it here.
const packageRoot = new URL("../", import.meta.url)
const pkg = JSON.parse(readFileSync(new URL("package.json", packageRoot), "utf8"))
const cssUrl = new URL("src/styles.css", packageRoot)
const css = readFileSync(cssUrl, "utf8")

const bareImports = [...css.matchAll(/@import\s+"([^"]+)"/g)]
  .map(([, specifier]) => specifier)
  .filter((specifier) => !specifier.startsWith("."))
const sources = [...css.matchAll(/@source\s+"([^"]+)"/g)].map(([, specifier]) => specifier)

function declaredPackages() {
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ])
}

describe("published stylesheet contract", () => {
  it("ships the stylesheet and the dist it scans", () => {
    expect(pkg.files).toContain("src/styles.css")
    expect(pkg.files).toContain("dist")
    expect(pkg.exports["./styles.css"]).toBe("./src/styles.css")
  })

  it("declares every package its stylesheet imports", () => {
    const declared = declaredPackages()
    for (const specifier of bareImports) {
      const name = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0]
      expect(declared.has(name), `@import "${specifier}" is not a declared dependency`).toBe(true)
    }
  })

  it("keeps every @source inside the installed package", () => {
    expect(sources.length).toBeGreaterThan(0)
    for (const specifier of sources) {
      const resolved = new URL(specifier, cssUrl).pathname
      expect(
        resolved.startsWith(packageRoot.pathname),
        `@source "${specifier}" escapes the package`,
      ).toBe(true)
    }
  })
})
