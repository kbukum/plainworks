/**
 * The densities a subtree can opt into with `data-density="<density>"`. `comfortable` is the
 * default; `compact` tightens the density spaces for data-heavy views.
 */
export const DENSITIES = ["comfortable", "compact"] as const

export type Density = (typeof DENSITIES)[number]

/**
 * The spaces a density controls: `control` is the block size of buttons and inputs, `stack` the
 * gap between related items, `inset` the padding inside a container, and `section` the gap between
 * page regions. Every control size stays above the 24×24 CSS-pixel minimum target.
 */
export const DENSITY_SPACES = ["control", "stack", "inset", "section"] as const

export type DensitySpace = (typeof DENSITY_SPACES)[number]
