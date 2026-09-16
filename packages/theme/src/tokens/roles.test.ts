import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { COLOR_SCHEMES } from "../theme/resolution"
import {
  BRAND_COLOR_ROLES,
  colorRoleVar,
  RADIUS_STEPS,
  SEMANTIC_COLOR_ROLES,
  semanticRoleVar,
} from "./roles"

const css = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8")

/** Bodies of every flat `selector { … }` rule (token blocks nest no braces). */
function blocks(selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g")
  return [...css.matchAll(re)].map((m) => m[1] ?? "")
}

const rootLight = blocks(":root").join("\n")
const darkGlobal = blocks(".dark").join("\n")

describe("three-tier design tokens (styles.css)", () => {
  it("maps every semantic role onto Tailwind's utility namespace (Tier 3)", () => {
    for (const role of SEMANTIC_COLOR_ROLES) {
      expect(css).toContain(`--color-${role}: var(--pw-${role})`)
    }
  })

  it("defines every semantic role for the light default and remaps it for dark (Tier 2)", () => {
    for (const role of SEMANTIC_COLOR_ROLES) {
      expect(rootLight).toContain(`--pw-${role}:`)
      expect(darkGlobal).toContain(`--pw-${role}:`)
    }
  })

  it("exposes every radius step derived from the base radius (Tier 3)", () => {
    for (const step of RADIUS_STEPS) {
      expect(css).toContain(`--radius-${step}:`)
    }
    expect(rootLight).toContain("--radius:")
  })

  it("ships a class for every color scheme in both light and dark", () => {
    for (const scheme of COLOR_SCHEMES) {
      expect(blocks(`.theme-${scheme}`).length).toBeGreaterThan(0)
      expect(blocks(`.dark.theme-${scheme}`).length).toBeGreaterThan(0)
    }
  })

  it("swaps only the brand roles per scheme, leaving neutral as the identity default", () => {
    const brandSwaps = COLOR_SCHEMES.filter((scheme) => scheme !== "neutral")
    for (const scheme of brandSwaps) {
      const light = blocks(`.theme-${scheme}`).join("\n")
      const dark = blocks(`.dark.theme-${scheme}`).join("\n")
      for (const role of BRAND_COLOR_ROLES) {
        expect(light).toContain(`--pw-${role}:`)
        expect(dark).toContain(`--pw-${role}:`)
      }
    }
    // neutral is the default brand: it only sets `color-scheme`, never reassigns a brand role.
    expect(blocks(".theme-neutral").join("\n")).not.toContain("--pw-primary:")
  })

  it("stays CSP-safe: class-driven with no inline-style or remote-import escape hatch", () => {
    expect(css).not.toMatch(/expression\s*\(/)
    expect(css).not.toContain("javascript:")
    expect(css).not.toMatch(/@import\s+url\(\s*["']?https?:/)
  })
})

describe("semantic token contract (roles.ts)", () => {
  it("references a role through the Tier 3 utility variable", () => {
    expect(colorRoleVar("primary")).toBe("var(--color-primary)")
  })

  it("references the Tier 2 semantic custom property a role resolves to", () => {
    expect(semanticRoleVar("primary")).toBe("var(--pw-primary)")
  })

  it("keeps the brand roles a subset of the semantic roles", () => {
    for (const role of BRAND_COLOR_ROLES) {
      expect(SEMANTIC_COLOR_ROLES).toContain(role)
    }
  })
})
