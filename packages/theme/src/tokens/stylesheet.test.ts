import { describe, expect, it } from "vitest"
import { parseRules, readStylesheet, resolveTokens } from "../testing/stylesheet"
import { COLOR_SCHEMES } from "../theme/resolution"
import {
  BRAND_COLOR_ROLES,
  DENSITIES,
  DENSITY_SPACES,
  ELEVATION_LEVELS,
  FONT_ROLES,
  MOTION_DURATIONS,
  MOTION_EASINGS,
  RADIUS_STEPS,
  SEMANTIC_COLOR_ROLES,
  STACKING_LAYERS,
  THEME_TOKENS,
  TYPE_STEPS,
} from "./index"

const tokensCss = readStylesheet("tokens.css")
const stylesCss = readStylesheet("styles.css")
const tokenRules = parseRules(tokensCss)
const styleRules = parseRules(stylesCss)

function declared(selector: string, context: readonly string[] = []): Map<string, string> {
  const merged = new Map<string, string>()
  for (const rule of tokenRules) {
    if (rule.selector === selector && rule.context.join("|") === context.join("|")) {
      for (const [name, value] of rule.declarations) merged.set(name, value)
    }
  }
  return merged
}

function tailwindTheme(): Map<string, string> {
  const merged = new Map<string, string>()
  for (const rule of styleRules.filter((candidate) => candidate.selector === "@theme inline")) {
    for (const [name, value] of rule.declarations) merged.set(name, value)
  }
  return merged
}

const MODE_DEPENDENT = [
  ...SEMANTIC_COLOR_ROLES,
  ...ELEVATION_LEVELS.map((level) => `shadow-${level}`),
]

describe("tokens.css", () => {
  it("defines every theme token for the light default", () => {
    const light = resolveTokens(tokenRules)
    for (const token of THEME_TOKENS) {
      expect(light.get(`--pw-${token}`), token).toBeTruthy()
    }
  })

  it("remaps every color and elevation token for dark mode", () => {
    const dark = declared(".dark")
    for (const token of MODE_DEPENDENT) {
      expect(dark.has(`--pw-${token}`), token).toBe(true)
    }
  })

  it("swaps only the brand roles per color scheme", () => {
    for (const scheme of COLOR_SCHEMES.filter((candidate) => candidate !== "neutral")) {
      for (const selector of [`.theme-${scheme}`, `.dark.theme-${scheme}`]) {
        const names = [...declared(selector).keys()].filter((name) => name.startsWith("--"))
        expect(names.sort(), selector).toEqual(
          BRAND_COLOR_ROLES.map((role) => `--pw-${role}`).sort(),
        )
      }
    }
    expect([...declared(".theme-neutral").keys()]).toEqual(["color-scheme"])
  })

  it("sets every density space for each density", () => {
    for (const density of DENSITIES) {
      const spaces = declared(`[data-density="${density}"]`)
      for (const space of DENSITY_SPACES) {
        expect(spaces.has(`--pw-space-${space}`), `${density} ${space}`).toBe(true)
      }
    }
  })

  it("collapses every motion duration when the user prefers reduced motion", () => {
    const reduced = resolveTokens(tokenRules, {
      media: ["@media (prefers-reduced-motion: reduce)"],
    })
    for (const duration of MOTION_DURATIONS) {
      expect(reduced.get(`--pw-duration-${duration}`)).toBe("0ms")
    }
  })

  it("strengthens boundaries and secondary text when the user prefers more contrast", () => {
    const media = "@media (prefers-contrast: more)"
    for (const selector of [":root", ".dark"]) {
      const stronger = declared(selector, [media])
      for (const role of ["border", "input", "muted-foreground"]) {
        expect(stronger.has(`--pw-${role}`), `${selector} ${role}`).toBe(true)
      }
    }
  })

  it("maps bare borders, the document surface, and focus onto semantic tokens", () => {
    const base = (selector: string) =>
      tokenRules.find((rule) => rule.selector === selector && rule.context[0] === "@layer base")
        ?.declarations ?? new Map<string, string>()
    expect(
      base("*, ::before, ::after, ::backdrop, ::file-selector-button").get("border-color"),
    ).toBe("var(--pw-border)")
    const body = base("body")
    expect(body.get("background-color")).toBe("var(--pw-background)")
    expect(body.get("color")).toBe("var(--pw-foreground)")
    expect(body.get("font-family")).toBe("var(--pw-font-sans)")
    const focus = base(":focus-visible")
    expect(focus.get("outline")).toBe("var(--pw-focus-width) solid var(--pw-ring)")
    expect(focus.get("outline-offset")).toBe("var(--pw-focus-offset)")
  })

  it("is plain CSS that any host can load without a Tailwind build", () => {
    expect(tokensCss).not.toMatch(/@(import|theme|source|utility|custom-variant|apply|plugin)\b/)
    expect(tokensCss).not.toMatch(/--(color|spacing|shadow|font|text|ease|radius)-/)
  })
})

describe("styles.css", () => {
  const theme = tailwindTheme()

  it("builds on tokens.css instead of redeclaring token values", () => {
    expect(stylesCss).toMatch(/@import\s+"\.\/tokens\.css"/)
    expect(stylesCss).not.toMatch(/--pw-[\w-]+\s*:/)
  })

  it("maps every token family onto the Tailwind utility namespace", () => {
    const expected: Record<string, string> = {}
    for (const role of SEMANTIC_COLOR_ROLES) expected[`--color-${role}`] = `var(--pw-${role})`
    for (const role of FONT_ROLES) expected[`--font-${role}`] = `var(--pw-font-${role})`
    for (const step of TYPE_STEPS) {
      expected[`--text-${step}`] = `var(--pw-text-${step})`
      expected[`--text-${step}--line-height`] = `var(--pw-text-${step}-leading)`
    }
    for (const space of DENSITY_SPACES) expected[`--spacing-${space}`] = `var(--pw-space-${space})`
    for (const level of ELEVATION_LEVELS)
      expected[`--shadow-${level}`] = `var(--pw-shadow-${level})`
    for (const easing of MOTION_EASINGS) expected[`--ease-${easing}`] = `var(--pw-ease-${easing})`
    expected["--default-transition-duration"] = "var(--pw-duration-base)"
    expected["--default-transition-timing-function"] = "var(--pw-ease-standard)"
    for (const [name, value] of Object.entries(expected)) {
      expect(theme.get(name), name).toBe(value)
    }
    for (const step of RADIUS_STEPS) {
      expect(theme.get(`--radius-${step}`), step).toContain("var(--pw-radius)")
    }
  })

  it("ships a utility for every stacking layer and motion duration", () => {
    const utilities = new Map(
      styleRules
        .filter((rule) => rule.selector.startsWith("@utility "))
        .map((rule) => [rule.selector.slice("@utility ".length), rule.declarations]),
    )
    for (const layer of STACKING_LAYERS) {
      expect(utilities.get(`z-${layer}`)?.get("z-index"), layer).toBe(`var(--pw-z-${layer})`)
    }
    for (const duration of MOTION_DURATIONS) {
      expect(utilities.get(`duration-${duration}`)?.get("transition-duration"), duration).toBe(
        `var(--pw-duration-${duration})`,
      )
    }
  })
})

describe("both stylesheets", () => {
  it.each([
    ["tokens.css", tokensCss],
    ["styles.css", stylesCss],
  ])("%s stays CSP-safe and carries no superseded token path", (_, css) => {
    expect(css).not.toMatch(/expression\s*\(/)
    expect(css).not.toContain("javascript:")
    expect(css).not.toMatch(/@import\s+url\(/)
    expect(css).not.toMatch(/var\(--radius\)|--radius\s*:/)
    expect(css).not.toContain("--pw-danger")
  })
})
