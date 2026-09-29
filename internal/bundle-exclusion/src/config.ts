import { isRecord } from "@plainworks/std"
import { BundleExclusionError } from "./error"
import { RULES } from "./rules"

/*
 * Usage: plainworks-bundle-exclusion <config.json>
 *
 * The config lives in the host and names its build output and what must stay out of it:
 *
 *   { "rule": "devtools", "directories": ["dist"], "expectedSources": ["/apps/web/src/"],
 *     "forbiddenSources": [], "markers": [], "allowUnmapped": ["/rolldown-runtime-"] }
 *
 * `rule` picks a shared rule from `rules.ts`; the lists add host-owned entries. `expectedSources`
 * is required: it proves the maps show the app's own modules. `allowUnmapped` names the scripts
 * the bundler emits without a map; any other unmapped script fails. Paths resolve against the
 * config file's directory.
 */

/** Host-owned bundle-exclusion config, after validation. */
export interface HostConfig {
  readonly rule: string
  readonly directories: readonly string[]
  readonly forbiddenSources: readonly string[]
  readonly markers: readonly string[]
  readonly expectedSources: readonly string[]
  readonly allowUnmapped: readonly string[]
}

/** Parse and validate a host config from its JSON text. */
export function parseHostConfig(file: string, text: string): HostConfig {
  const parsed = parseJson(file, text)
  if (!isRecord(parsed)) throw new BundleExclusionError(`${file}: expected a JSON object`)
  const rule = parsed.rule
  if (typeof rule !== "string" || !Object.hasOwn(RULES, rule)) {
    throw new BundleExclusionError(
      `${file}: "rule" must be one of ${Object.keys(RULES).join(", ")}`,
    )
  }
  const directories = stringList(parsed.directories, "directories", file)
  if (directories.length === 0) {
    throw new BundleExclusionError(`${file}: "directories" must name the build output`)
  }
  const expectedSources = stringList(parsed.expectedSources, "expectedSources", file)
  if (expectedSources.length === 0) {
    throw new BundleExclusionError(
      `${file}: "expectedSources" must name at least one of the app's own source paths`,
    )
  }
  return {
    rule,
    directories,
    forbiddenSources: stringList(parsed.forbiddenSources, "forbiddenSources", file),
    markers: stringList(parsed.markers, "markers", file),
    expectedSources,
    allowUnmapped: stringList(parsed.allowUnmapped, "allowUnmapped", file),
  }
}

function parseJson(file: string, text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new BundleExclusionError(`${file}: invalid JSON`, { cause: error })
  }
}

function stringList(value: unknown, key: string, file: string): readonly string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new BundleExclusionError(`${file}: "${key}" must be an array of strings`)
  }
  return value
}
