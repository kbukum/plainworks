import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Contract test for the published stylesheet: it ships from the build output (`dist/styles.css`),
// and in an installed app its `@source` specifiers resolve relative to that shipped file inside
// node_modules. The manifest must export the built file, ship the `dist` it scans, and declare
// every imported package. A bare `@import` that is not a declared dependency, or a `@source`
// escaping the package, breaks the consumer's build — pin it here.
const packageRoot = new URL("../", import.meta.url)
const pkg = JSON.parse(readFileSync(new URL("package.json", packageRoot), "utf8"))
const css = readFileSync(new URL("src/styles.css", packageRoot), "utf8")
// A `@source` glob in the shipped stylesheet resolves relative to its built location, not source.
const shippedCssUrl = new URL("dist/styles.css", packageRoot)

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
  it("exports the stylesheet from the build output the packaging gate covers", () => {
    expect(pkg.files).toContain("dist")
    expect(pkg.exports["./styles.css"]).toBe("./dist/styles.css")
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
      const resolved = new URL(specifier, shippedCssUrl).pathname
      expect(
        resolved.startsWith(packageRoot.pathname),
        `@source "${specifier}" escapes the package`,
      ).toBe(true)
    }
  })
})
