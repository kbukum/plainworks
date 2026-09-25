/** The corner radius steps, exposed as `--radius-<step>` and derived from the base `radius` token. */
export const RADIUS_STEPS = ["sm", "md", "lg", "xl"] as const

export type RadiusStep = (typeof RADIUS_STEPS)[number]
