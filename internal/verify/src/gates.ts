/** One Definition-of-Done gate: a named check and the commands that run it. */
export interface Gate {
  readonly name: string
  /** What the gate enforces, in a few words, for `--list`. */
  readonly summary: string
  /**
   * Builds the commands to run from the `--filter` values. A repo-wide gate ignores them; a package
   * gate forwards them to turbo so only the selected packages (and what they need) run.
   */
  commands(filters: readonly string[]): readonly (readonly string[])[]
}

function repoGate(name: string, summary: string): Gate {
  return { name, summary, commands: () => [["bun", "run", name]] }
}

function turboGate(name: string, summary: string, ...extra: string[][]): Gate {
  return {
    name,
    summary,
    commands: (filters) => [
      ["turbo", "run", name, ...filters.map((filter) => `--filter=${filter}`)],
      ...extra,
    ],
  }
}

/**
 * The ordered Definition of Done. This list is the only place the gates are enumerated: CI, the
 * release workflow, and the skills run `bun run verify` instead of repeating it. Cheap repo-wide
 * checks run first so a typo fails in seconds, before any build.
 */
export const GATES: readonly Gate[] = [
  repoGate("check-versions", "sherif + syncpack catalog sync, and the Changesets release line"),
  repoGate("lint", "Biome lint and format"),
  repoGate("check-comments", "comment prose within the 100-column width"),
  repoGate("check-layer-map", "layer-map docs match internal/boundaries/layers.json"),
  repoGate("check-registry", "vendored atoms match shadcn.lock.json"),
  repoGate("check-shape", "every workspace matches its generated profile"),
  repoGate("check-axe-coverage", "every React render test file awaits the shared axe assertion"),
  turboGate("typecheck", "tsc --noEmit for every project and the generator", [
    "tsc",
    "-p",
    "turbo/generators/tsconfig.json",
  ]),
  repoGate("check-boundaries", "dependency-cruiser layers, cycles, and client/server split"),
  turboGate("build", "tsdown ESM-only dist for every package"),
  turboGate("test", "Vitest with coverage thresholds"),
  turboGate("check-packaging", "publint + are-the-types-wrong over each packed tarball"),
  turboGate("check-production", "host production builds exclude the development inspector"),
]
