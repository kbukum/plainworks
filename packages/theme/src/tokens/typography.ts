/** The font family roles. Both default to system stacks, so the kit needs no web-font request. */
export const FONT_ROLES = ["sans", "mono"] as const

export type FontRole = (typeof FONT_ROLES)[number]

/**
 * The type scale, smallest first. Each step has a size (`text-<step>`) and a line height
 * (`text-<step>-leading`). `heading` and `display` scale fluidly with the viewport but stay
 * rem-based, so browser zoom still enlarges them.
 */
export const TYPE_STEPS = ["caption", "body", "title", "heading", "display"] as const

export type TypeStep = (typeof TYPE_STEPS)[number]
