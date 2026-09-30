import { describe, expect, it } from "vitest"
import { COLOR_SCHEMES } from "../preference"
import { parseRules, readStylesheet, resolveTokens, SYSTEM_ROOT } from "../testing/stylesheet"
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

  it("follows the OS preference in system mode, matching the explicit mode exactly", () => {
    const osDark = "@media (prefers-color-scheme: dark)"
    for (const scheme of COLOR_SCHEMES) {
      for (const contrast of [[], ["@media (prefers-contrast: more)"]]) {
        const label = `${scheme} ${contrast.join(" ")}`
        expect(resolveTokens(tokenRules, { scheme, media: [osDark, ...contrast] }), label).toEqual(
          resolveTokens(tokenRules, { mode: "dark", scheme, media: contrast }),
        )
        expect(resolveTokens(tokenRules, { scheme, media: contrast }), label).toEqual(
          resolveTokens(tokenRules, { mode: "light", scheme, media: contrast }),
        )
        // An explicit light choice wins over a dark OS.
        expect(
          resolveTokens(tokenRules, { mode: "light", scheme, media: [osDark, ...contrast] }),
          label,
        ).toEqual(resolveTokens(tokenRules, { mode: "light", scheme, media: contrast }))
      }
    }
  })

  it("sets a dark color-scheme for system mode on a dark OS", () => {
    expect(declared(SYSTEM_ROOT, ["@media (prefers-color-scheme: dark)"]).get("color-scheme")).toBe(
      "dark",
    )
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

  it("collapses motion when the document asks for reduced motion, whatever the device says", () => {
    const reduced = declared(':root[data-motion="reduce"]')
    for (const duration of MOTION_DURATIONS) {
      expect(reduced.get(`--pw-duration-${duration}`)).toBe("0ms")
    }
    const everything = declared(
      ':root[data-motion="reduce"] *, :root[data-motion="reduce"] *::before, :root[data-motion="reduce"] *::after',
    )
    expect(everything.get("animation-duration")).toBe("0s !important")
    expect(everything.get("transition-duration")).toBe("0s !important")
    expect(everything.get("animation-iteration-count")).toBe("1 !important")
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

  it("restores a system-color focus outline under forced colors, above utilities", () => {
    // Forced colors drop the atoms' box-shadow ring, and `outline-none` removes the outline, so
    // this rule stays unlayered to beat the utility layer.
    const forced = tokenRules.find(
      (rule) =>
        rule.selector === ":focus-visible" &&
        rule.context.length === 1 &&
        rule.context[0] === "@media (forced-colors: active)",
    )
    expect(forced?.declarations.get("outline")).toBe("var(--pw-focus-width) solid CanvasText")
    expect(forced?.declarations.get("outline-offset")).toBe("var(--pw-focus-offset)")
  })

  it("aliases the shadcn variable names onto the tokens in both modes", () => {
    for (const dark of [false, true]) {
      const tokens = resolveTokens(tokenRules, { mode: dark ? "dark" : "light" })
      for (const name of ["radius", "foreground", "secondary"]) {
        expect(tokens.get(`--${name}`)).toBe(tokens.get(`--pw-${name}`))
      }
    }
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

  it.each([
    '[data-slot="tabs-content"]:focus-visible',
    '[data-slot="menubar-trigger"]:focus-visible',
    '[data-slot="slider-thumb"]:has(:focus-visible)',
  ])("draws the focus outline on %s, which the atom leaves unmarked", (selector) => {
    // In the utilities layer, the attribute selector outranks the atom's `outline-none`.
    const rule = styleRules.find(
      (candidate) =>
        candidate.selector.split(/,\s*/).includes(selector) &&
        candidate.context[0] === "@layer utilities",
    )
    expect(rule?.declarations.get("outline")).toBe("var(--pw-focus-width) solid var(--pw-ring)")
    expect(rule?.declarations.get("outline-offset")).toBe("var(--pw-focus-offset)")
  })

  it.each(
    ["dropdown-menu", "context-menu", "menubar"]
      .flatMap((menu) =>
        ["item", "checkbox-item", "radio-item", "sub-trigger"].map((part) => `${menu}-${part}`),
      )
      .concat("select-item")
      .map((slot) => `[data-slot="${slot}"]:focus-visible`),
  )(
    "outlines %s inside its popup, since the atom marks keyboard focus by a faint fill",
    (selector) => {
      // The fill alone misses the 3:1 non-text contrast a focus state needs (WCAG 1.4.11); the
      // negative offset keeps the outline inside the popup's clipped, scrollable list.
      const rule = styleRules.find(
        (candidate) =>
          candidate.selector.split(/,\s*/).includes(selector) &&
          candidate.context[0] === "@layer utilities",
      )
      expect(rule?.declarations.get("outline")).toBe("var(--pw-focus-width) solid var(--pw-ring)")
      expect(rule?.declarations.get("outline-offset")).toBe("calc(-1 * var(--pw-focus-width))")
    },
  )

  it("bounds both dialog atoms to the viewport and scrolls them, as an overridable default", () => {
    // The atoms center the popup with no height limit and the page behind a modal is
    // scroll-locked, so a taller dialog would leave its title and actions unreachable (WCAG
    // 1.4.10). `:where` gives the rule no specificity, so a call-site utility still wins.
    const rule = styleRules.find(
      (candidate) =>
        candidate.selector ===
          ':where([data-slot="dialog-content"], [data-slot="alert-dialog-content"])' &&
        candidate.context[0] === "@layer utilities",
    )
    // The same 1rem margin the atom keeps on each side horizontally.
    expect(rule?.declarations.get("max-height")).toBe("calc(100dvh - 2rem)")
    expect(rule?.declarations.get("overflow-y")).toBe("auto")
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
    const bareRadius = [...css.matchAll(/--radius\s*:\s*([^;]+);/g)].map(([, value]) => value)
    expect(bareRadius.every((value) => value === "var(--pw-radius)")).toBe(true)
    expect(css).not.toContain("--pw-danger")
  })
})
