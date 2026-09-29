import type { ExclusionRule } from "./scan"

/**
 * The embedded inspector. Its package sources cover every entry and adapter; the markers catch its
 * stylesheet, which carries no source map, through the CSS sentinel rule and the mount root's
 * `data-` attribute.
 */
const devtools: ExclusionRule = {
  forbiddenSources: ["/packages/devtools/", "/@plainworks/devtools/"],
  markers: ["plainworks-devtools", "plainworksDevtools", "Plainworks inspector"],
  expectedSources: [],
  allowUnmapped: [],
}

/** Named rules a host config can reference. */
export const RULES: Readonly<Record<string, ExclusionRule>> = { devtools }
