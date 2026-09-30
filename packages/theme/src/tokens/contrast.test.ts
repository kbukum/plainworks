import { describe, expect, it } from "vitest"
import { COLOR_SCHEMES } from "../preference"
import { contrastRatio, type Tint } from "../testing/contrast"
import { parseRules, readStylesheet, resolveTokens } from "../testing/stylesheet"
import { STATUS_TONES } from "./index"

// WCAG 2.2 AA: 4.5:1 for text (1.4.3) and 3:1 for control boundaries and focus indicators (1.4.11).
const TEXT = 4.5
const NON_TEXT = 3
// The strongest tint a toned status surface (badge, callout) may paint behind status-colored text.
const STATUS_TINT_ALPHA = 0.2
// Vendored shadcn atoms paint focus as a `ring-ring/50` halo, so the ring must still reach 3:1 at
// half opacity over every surface a control sits on.
const FOCUS_HALO_ALPHA = 0.5
const FOCUS_SURFACES = ["background", "card", "popover", "muted"] as const
// Translucent text the atoms paint, as [role, alpha, surface]: inactive tabs use
// `text-foreground/60` on the muted tab list.
const TRANSLUCENT_TEXT = [["foreground", 0.6, "muted"]] as const
// In dark mode an outline button fills with `input/30` and inherits its text color, so inside a
// destructive alert it paints destructive text on that fill.
const OUTLINE_FILL_ALPHA = 0.3
// A destructive button paints destructive text on its own `destructive/…` tint: 10% at rest and
// 20% on hover in light mode, 20% and 30% in dark mode. It sits on a page, a card, a popover, or a
// dialog footer (`muted/50` over the popover).
const DESTRUCTIVE_TINT_ALPHAS = { light: [0.1, 0.2], dark: [0.2, 0.3] } as const
const MUTED_FOOTER_ALPHA = 0.5
// A default button keeps `primary-foreground` text but fades its fill to `primary/80` on hover,
// over the same surfaces.
const PRIMARY_HOVER_ALPHA = 0.8

const rules = parseRules(readStylesheet("tokens.css"))

const conditions = COLOR_SCHEMES.flatMap((scheme) =>
  [false, true].flatMap((dark) =>
    [[], ["@media (prefers-contrast: more)"]].map((media) => ({
      scheme,
      dark,
      mode: dark ? ("dark" as const) : ("light" as const),
      media,
    })),
  ),
)

function failures(tokens: Map<string, string>, dark = false): string[] {
  const color = (role: string): string => {
    const value = tokens.get(`--pw-${role}`)
    if (value === undefined) throw new Error(`Missing --pw-${role}`)
    return value
  }
  type Backdrop = string | { role: string; tint: string; alpha?: number }
  const pairs: [string, Backdrop, number][] = [
    ["foreground", "background", TEXT],
    ["card-foreground", "card", TEXT],
    ["popover-foreground", "popover", TEXT],
    ["secondary-foreground", "secondary", TEXT],
    ["accent-foreground", "accent", TEXT],
    ["muted-foreground", "muted", TEXT],
    ["muted-foreground", "background", TEXT],
    ["muted-foreground", "card", TEXT],
    ["primary-foreground", "primary", TEXT],
    ["primary", "background", TEXT],
    ["primary", "card", TEXT],
    ["ring", "background", NON_TEXT],
    ["ring", "card", NON_TEXT],
    ["destructive", "background", NON_TEXT],
    ["destructive", "card", NON_TEXT],
    ["input", "background", NON_TEXT],
    ["input", "card", NON_TEXT],
    ...STATUS_TONES.flatMap((tone): [string, Backdrop, number][] => [
      [`${tone}-foreground`, tone, TEXT],
      [tone, "background", TEXT],
      [tone, "card", TEXT],
      [tone, { role: tone, tint: "card" }, TEXT],
    ]),
    ...(dark ? (["foreground", "destructive"] as const) : []).flatMap(
      (role): [string, Backdrop, number][] =>
        (["background", "card"] as const).map((surface) => [
          role,
          { role: "input", tint: surface, alpha: OUTLINE_FILL_ALPHA },
          TEXT,
        ]),
    ),
  ]
  const halos = FOCUS_SURFACES.flatMap((surface) => {
    const halo = { color: color("ring"), alpha: FOCUS_HALO_ALPHA, backdrop: color(surface) }
    const ratio = contrastRatio(halo, color(surface))
    return ratio >= NON_TEXT ? [] : [`ring halo on ${surface}: ${ratio.toFixed(2)} < ${NON_TEXT}`]
  })
  const translucent = TRANSLUCENT_TEXT.flatMap(([role, alpha, surface]) => {
    const text = { color: color(role), alpha, backdrop: color(surface) }
    const ratio = contrastRatio(text, color(surface))
    return ratio >= TEXT ? [] : [`${role}/${alpha} on ${surface}: ${ratio.toFixed(2)} < ${TEXT}`]
  })
  const surfaces: Record<string, Tint | string> = {
    background: color("background"),
    card: color("card"),
    popover: color("popover"),
    "dialog footer": {
      color: color("muted"),
      alpha: MUTED_FOOTER_ALPHA,
      backdrop: color("popover"),
    },
  }
  const destructiveButtons = DESTRUCTIVE_TINT_ALPHAS[dark ? "dark" : "light"].flatMap((alpha) =>
    Object.entries(surfaces).flatMap(([surface, backdrop]) => {
      const fill = { color: color("destructive"), alpha, backdrop }
      const ratio = contrastRatio(color("destructive"), fill)
      return ratio >= TEXT
        ? []
        : [`destructive on destructive/${alpha} over ${surface}: ${ratio.toFixed(2)} < ${TEXT}`]
    }),
  )
  const primaryHovers = Object.entries(surfaces).flatMap(([surface, backdrop]) => {
    const fill = { color: color("primary"), alpha: PRIMARY_HOVER_ALPHA, backdrop }
    const ratio = contrastRatio(color("primary-foreground"), fill)
    return ratio >= TEXT
      ? []
      : [
          `primary-foreground on primary/${PRIMARY_HOVER_ALPHA} over ${surface}: ${ratio.toFixed(2)}`,
        ]
  })
  return [
    ...halos,
    ...translucent,
    ...destructiveButtons,
    ...primaryHovers,
    ...pairs.flatMap(([front, back, minimum]) => {
      const backdrop =
        typeof back === "string"
          ? color(back)
          : {
              color: color(back.role),
              alpha: back.alpha ?? STATUS_TINT_ALPHA,
              backdrop: color(back.tint),
            }
      const ratio = contrastRatio(color(front), backdrop)
      const label = typeof back === "string" ? back : `${back.role} tint on ${back.tint}`
      return ratio >= minimum ? [] : [`${front} on ${label}: ${ratio.toFixed(2)} < ${minimum}`]
    }),
  ]
}

describe("token contrast (WCAG 2.2 AA)", () => {
  it.each(conditions)("$scheme dark=$dark $media meets AA", (condition) => {
    expect(failures(resolveTokens(rules, condition), condition.dark)).toEqual([])
  })

  it("reports a focus ring that is too faint as a half-opacity halo", () => {
    const tokens = resolveTokens(rules)
    tokens.set("--pw-ring", "oklch(0.55 0 0)")
    expect(failures(tokens)).toContainEqual(expect.stringMatching(/^ring halo on background:/))
  })

  it("reports a failing pair instead of passing vacuously", () => {
    const tokens = resolveTokens(rules)
    tokens.set("--pw-muted-foreground", "oklch(0.9 0 0)")
    expect(failures(tokens)).toContainEqual(
      expect.stringMatching(/^muted-foreground on background:/),
    )
  })
})
