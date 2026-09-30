/**
 * A rule as a host or a shared rule writes it, before `resolveRule` turns its paths into absolute
 * locations. Sources are named like imports: `./src/` is a folder of the app, `@scope/name/src/` a
 * folder inside an installed package. `allowUnmapped` holds globs relative to the config file, or
 * `manifest.json#field` to allow the files a bundler manifest lists.
 */
export interface RuleSpec {
  readonly forbiddenSources: readonly string[]
  readonly markers: readonly string[]
  readonly expectedSources: readonly string[]
  readonly allowUnmapped: readonly string[]
}

/**
 * The embedded inspector. Its package covers every entry and adapter; the markers catch its
 * stylesheet, which carries no source map, through the CSS sentinel rule and the mount root's
 * `data-` attribute.
 */
const devtools: RuleSpec = {
  forbiddenSources: ["@plainworks/devtools/"],
  markers: ["plainworks-devtools", "plainworksDevtools", "Plainworks inspector"],
  expectedSources: [],
  allowUnmapped: [],
}

/** Named rules a host config can reference. */
export const RULES: Readonly<Record<string, RuleSpec>> = { devtools }

/** Merge rule specs, keeping each entry once. */
export function mergeRules(...rules: readonly Partial<RuleSpec>[]): RuleSpec {
  const merged = (key: keyof RuleSpec): string[] => [
    ...new Set(rules.flatMap((rule) => rule[key] ?? [])),
  ]
  return {
    forbiddenSources: merged("forbiddenSources"),
    markers: merged("markers"),
    expectedSources: merged("expectedSources"),
    allowUnmapped: merged("allowUnmapped"),
  }
}
