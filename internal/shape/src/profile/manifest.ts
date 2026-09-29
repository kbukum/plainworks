import { isRecord } from "@plainworks/std"
import { renderBin, renderExports, renderFiles } from "@plainworks/tsdown-config"
import type { Manifest } from "@plainworks/workspace"
import type { WorkspaceFacts } from "../inspect"

/**
 * The `package.json` fields and scripts a workspace's profile derives. A value of `undefined`
 * means the field must be absent.
 */
export interface ManifestProfile {
  readonly fields: Readonly<Record<string, unknown>>
  readonly scripts: Readonly<Record<string, string | undefined>>
  /**
   * Dev dependencies the workspace must declare, unless it already needs them at runtime.
   * Others it declares are its own.
   */
  readonly devDependencies: Readonly<Record<string, string>>
}

const TEST_WITH_COVERAGE = "vitest run --coverage"
const CHECK_PACKAGING = "plainworks-release check-packaging"

// Biome lints and formats the whole repository from the root, so a per-workspace `lint` script
// would only repeat it.
const NO_LINT = { lint: undefined }

/** Derives the manifest fields, scripts, and dev dependencies a workspace must carry. */
export function manifestProfile(facts: WorkspaceFacts): ManifestProfile {
  const built = facts.kind === "package" || facts.kind === "cli"
  const presets = built ? [TSDOWN_PRESET, VITEST_PRESET] : [VITEST_PRESET]
  const dependencies = isRecord(facts.manifest.dependencies) ? facts.manifest.dependencies : {}
  const devDependencies = Object.fromEntries(
    presets
      .filter((preset) => preset !== facts.manifest.name && !(preset in dependencies))
      .map((preset) => [preset, "workspace:*"]),
  )
  return { ...manifestFields(facts), devDependencies }
}

const TSDOWN_PRESET = "@plainworks/tsdown-config"
const VITEST_PRESET = "@plainworks/vitest-config"

function manifestFields(facts: WorkspaceFacts): Omit<ManifestProfile, "devDependencies"> {
  switch (facts.kind) {
    case "package": {
      const { build } = facts
      const published = facts.manifest.private !== true
      const generated = Object.values(build.assets ?? {}).flatMap((asset) =>
        "generatedBy" in asset ? [`bun ${asset.generatedBy}`] : [],
      )
      const styles = Object.keys(build.assets ?? {}).some((name) => name.endsWith(".css"))
      return {
        fields: {
          type: "module",
          sideEffects: styles ? ["**/*.css"] : false,
          exports: renderExports(build),
          files: published ? renderFiles(build) : undefined,
        },
        scripts: {
          build: ["tsdown", ...generated].join(" && "),
          typecheck: typecheckScript(facts),
          test: TEST_WITH_COVERAGE,
          "check-packaging": published ? CHECK_PACKAGING : undefined,
          ...NO_LINT,
        },
      }
    }
    case "cli":
      return {
        fields: {
          type: "module",
          bin: renderBin(facts.build),
          exports: undefined,
          files: renderFiles(facts.build),
        },
        scripts: {
          typecheck: typecheckScript(facts),
          test: TEST_WITH_COVERAGE,
          "check-packaging": CHECK_PACKAGING,
          ...NO_LINT,
        },
      }
    case "tool": {
      const name = facts.dir.slice(facts.dir.lastIndexOf("/") + 1)
      return {
        fields: {
          private: true,
          type: "module",
          bin:
            facts.readSource("cli.ts") !== undefined
              ? { [`plainworks-${name}`]: "./src/cli.ts" }
              : undefined,
          exports:
            facts.readSource("index.ts") !== undefined ? { ".": "./src/index.ts" } : undefined,
        },
        scripts: { typecheck: typecheckScript(facts), test: TEST_WITH_COVERAGE, ...NO_LINT },
      }
    }
    case "app":
      return {
        fields: { private: true, type: "module" },
        scripts: { test: "vitest run", ...NO_LINT },
      }
  }
}

/**
 * The typecheck projects, in the order they run: the server `src` project first, then `client`,
 * then the rest by name. Empty when the workspace has only `tsconfig.json`.
 */
export function typecheckProjects(facts: WorkspaceFacts): string[] {
  const rank = (name: string): number =>
    name === "tsconfig.src.json" ? 0 : name === "tsconfig.client.json" ? 1 : 2
  return [...facts.tsconfigs.keys()]
    .filter((name) => name !== "tsconfig.json")
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

function typecheckScript(facts: WorkspaceFacts): string {
  const projects = typecheckProjects(facts)
  if (projects.length === 0) return "tsc --noEmit"
  return projects.map((project) => `tsc --noEmit -p ${project}`).join(" && ")
}

// Where a missing field goes: after the nearest earlier field of this order that is present.
const FIELD_ORDER = [
  "name",
  "version",
  "description",
  "private",
  "license",
  "author",
  "homepage",
  "repository",
  "bugs",
  "keywords",
  "type",
  "sideEffects",
  "bin",
  "exports",
  "files",
  "scripts",
  "dependencies",
  "peerDependencies",
  "devDependencies",
]

/** Returns `manifest` with the profile applied, keeping the order of the fields it already has. */
export function applyManifestProfile(manifest: Manifest, profile: ManifestProfile): Manifest {
  let entries = Object.entries(manifest)
  const scripts: Record<string, unknown> = {
    ...(isRecord(manifest.scripts) ? manifest.scripts : {}),
  }
  for (const [name, command] of Object.entries(profile.scripts)) {
    if (command === undefined) delete scripts[name]
    else scripts[name] = command
  }
  const devDependencies: Record<string, unknown> = {
    ...(isRecord(manifest.devDependencies) ? manifest.devDependencies : {}),
    ...profile.devDependencies,
  }
  const sortedDevDependencies = Object.fromEntries(
    Object.entries(devDependencies).sort(([a], [b]) => a.localeCompare(b)),
  )
  const wanted: Record<string, unknown> = {
    ...profile.fields,
    scripts,
    devDependencies: sortedDevDependencies,
  }
  for (const [key, value] of Object.entries(wanted)) {
    const at = entries.findIndex(([name]) => name === key)
    if (value === undefined) {
      if (at !== -1) entries.splice(at, 1)
    } else if (at !== -1) {
      entries[at] = [key, value]
    } else {
      entries = insertInOrder(entries, key, value)
    }
  }
  return Object.fromEntries(entries)
}

function insertInOrder(
  entries: [string, unknown][],
  key: string,
  value: unknown,
): [string, unknown][] {
  const earlier = FIELD_ORDER.slice(0, FIELD_ORDER.indexOf(key))
  let at = 0
  entries.forEach(([name], index) => {
    if (earlier.includes(name)) at = index + 1
  })
  return [...entries.slice(0, at), [key, value], ...entries.slice(at)]
}
