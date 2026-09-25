import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// The locked shadcn atoms reference a few shadcn variable names directly in arbitrary values (for
// example `rounded-[calc(var(--radius)-3px)]`). Those names must come from the theme, or the
// declaration silently falls back to nothing. Variables an atom sets itself are exempt.
const shadcnDir = new URL("./shadcn/", import.meta.url)
const themeCss = ["styles.css", "tokens.css"]
  .map((file) =>
    readFileSync(fileURLToPath(import.meta.resolve(`@plainworks/theme/${file}`)), "utf8"),
  )
  .join("\n")

function referencedVariables(): Map<string, string> {
  const found = new Map<string, string>()
  for (const file of readdirSync(shadcnDir).filter((name) => name.endsWith(".tsx"))) {
    const source = readFileSync(new URL(file, shadcnDir), "utf8")
    const local = new Set(
      [...source.matchAll(/(?:"|\[)(--[a-z0-9-]+)(?:"|:)/g)].map(([, name]) => name),
    )
    for (const [, name] of source.matchAll(/var\((--[a-z0-9-]+)/g)) {
      if (name !== undefined && !local.has(name)) found.set(name, file)
    }
  }
  return found
}

describe("theme variables used by the shadcn atoms", () => {
  it("finds the raw variable references it guards", () => {
    expect(referencedVariables().size).toBeGreaterThan(0)
  })

  it("resolves every raw variable to a theme declaration", () => {
    for (const [name, file] of referencedVariables()) {
      expect(themeCss, `${file} uses var(${name}), which the theme never declares`).toMatch(
        new RegExp(`${name}\\s*:`),
      )
    }
  })
})
