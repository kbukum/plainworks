import { describe, expect, it } from "vitest"
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
  STATUS_TONES,
  THEME_TOKENS,
  TYPE_STEPS,
  themeVar,
} from "./index"

describe("theme token contract", () => {
  it("references a token through its runtime custom property", () => {
    expect(themeVar("primary")).toBe("var(--pw-primary)")
    expect(themeVar("z-toast")).toBe("var(--pw-z-toast)")
    expect(themeVar("space-control")).toBe("var(--pw-space-control)")
  })

  it("gives every status tone a fill and a readable foreground role", () => {
    expect(STATUS_TONES).toEqual(["info", "success", "warning", "destructive"])
    for (const tone of STATUS_TONES) {
      expect(SEMANTIC_COLOR_ROLES).toContain(tone)
      expect(SEMANTIC_COLOR_ROLES).toContain(`${tone}-foreground`)
    }
  })

  it("keeps the brand roles a subset of the semantic roles", () => {
    for (const role of BRAND_COLOR_ROLES) {
      expect(SEMANTIC_COLOR_ROLES).toContain(role)
    }
  })

  it("lists every token once, across every token family", () => {
    const expected = [
      ...SEMANTIC_COLOR_ROLES,
      "radius",
      ...FONT_ROLES.map((role) => `font-${role}`),
      ...TYPE_STEPS.flatMap((step) => [`text-${step}`, `text-${step}-leading`]),
      ...DENSITY_SPACES.map((space) => `space-${space}`),
      ...ELEVATION_LEVELS.map((level) => `shadow-${level}`),
      "focus-width",
      "focus-offset",
      ...MOTION_DURATIONS.map((duration) => `duration-${duration}`),
      ...MOTION_EASINGS.map((easing) => `ease-${easing}`),
      ...STACKING_LAYERS.map((layer) => `z-${layer}`),
    ]
    expect([...THEME_TOKENS].sort()).toEqual(expected.sort())
    expect(new Set(THEME_TOKENS).size).toBe(THEME_TOKENS.length)
  })

  it("names the scales the kit composes against", () => {
    expect(RADIUS_STEPS).toEqual(["sm", "md", "lg", "xl"])
    expect(DENSITIES).toEqual(["comfortable", "compact"])
    expect(STACKING_LAYERS).toEqual(["sticky", "overlay", "popover", "toast"])
  })
})
