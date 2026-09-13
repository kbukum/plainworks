/**
 * The semantic design-token contract: the role names the kit styles against. This is the neutral
 * TypeScript mirror of the Tier 2 semantic layer in `styles.css` — one source of truth a test can
 * hold the stylesheet to, and the vocabulary later `cva` variant helpers bind to. Components never
 * reference Tier 1 palette values (`--pw-neutral-*`); they reference these roles only, so a theme
 * swaps by reassigning the roles with no JS.
 */

/** Every semantic color role exposed to Tailwind utilities as `--color-<role>` (Tier 3). */
export const SEMANTIC_COLOR_ROLES = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
] as const

export type SemanticColorRole = (typeof SEMANTIC_COLOR_ROLES)[number]

/** The role names whose value changes per color scheme; the rest are scheme-independent neutrals. */
export const BRAND_COLOR_ROLES = ["primary", "primary-foreground", "ring"] as const

export type BrandColorRole = (typeof BRAND_COLOR_ROLES)[number]

/** The radius steps exposed as `--radius-<step>`, derived from the base `--radius`. */
export const RADIUS_STEPS = ["sm", "md", "lg", "xl"] as const

export type RadiusStep = (typeof RADIUS_STEPS)[number]

/** Reference a semantic role through the Tier 3 utility variable Tailwind emits (`var(--color-…)`). */
export function colorRoleVar(role: SemanticColorRole): string {
  return `var(--color-${role})`
}

/** Reference the Tier 2 semantic custom property a role resolves to (`var(--pw-…)`). */
export function semanticRoleVar(role: SemanticColorRole): string {
  return `var(--pw-${role})`
}
