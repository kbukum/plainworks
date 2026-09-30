import { isRecord } from "@plainworks/std"
import { BundleExclusionError } from "./error"
import { RULES } from "./rules"

/*
 * Usage: plainworks-bundle-exclusion <config.json>
 *
 * The config lives in the host and names its build output and what must stay out of it:
 *
 *   { "rule": "devtools", "directories": ["dist"], "expectedSources": ["./src/"],
 *     "forbiddenSources": ["./src/dev-tools/", "@plainworks/mocks/src/control/"],
 *     "allowUnmapped": ["dist/assets/rolldown-runtime-*.js", "dist/manifest.json#polyfills"] }
 *
 * `rule` picks a shared rule from `rules.ts`; the lists add host-owned entries. `expectedSources`
 * is required: it proves the maps show the app's own modules. Sources are named like imports — an
 * app path starts with `./` or `../`, anything else is a package path. `allowUnmapped` names the
 * scripts the bundler emits without a map, as globs or as a manifest field that lists them; any
 * other unmapped script fails. Every path is relative to the config file, so the config reads the
 * same wherever the app lives.
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
  const directories = relativeList(parsed.directories, "directories", file)
  if (directories.length === 0) {
    throw new BundleExclusionError(`${file}: "directories" must name the build output`)
  }
  const expectedSources = sourceList(parsed.expectedSources, "expectedSources", file)
  if (expectedSources.length === 0) {
    throw new BundleExclusionError(
      `${file}: "expectedSources" must name at least one of the app's own source paths`,
    )
  }
  return {
    rule,
    directories,
    forbiddenSources: sourceList(parsed.forbiddenSources, "forbiddenSources", file),
    markers: stringList(parsed.markers, "markers", file),
    expectedSources,
    allowUnmapped: relativeList(parsed.allowUnmapped, "allowUnmapped", file),
  }
}

function parseJson(file: string, text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new BundleExclusionError(`${file}: invalid JSON`, { cause: error })
  }
}

const ABSOLUTE = /^(?:[/\\]|[a-z]:[/\\])/i
const APP_PATH = /^\.\.?\//
// A package name (`name` or `@scope/name`) followed by a folder or file inside it.
const PACKAGE_PATH = /^(?:@[^/.][^/]*\/)?[^/.@][^/]*(?:\/.*)?$/

function relativeList(value: unknown, key: string, file: string): readonly string[] {
  const list = stringList(value, key, file)
  if (list.some((entry) => ABSOLUTE.test(entry))) {
    throw new BundleExclusionError(
      `${file}: "${key}" entries must be paths relative to the config file`,
    )
  }
  return list
}

function sourceList(value: unknown, key: string, file: string): readonly string[] {
  const list = stringList(value, key, file)
  const valid = (entry: string): boolean => APP_PATH.test(entry) || PACKAGE_PATH.test(entry)
  if (!list.every(valid)) {
    throw new BundleExclusionError(
      `${file}: "${key}" entries must be app paths ("./src/") or package paths ("@scope/name/src/")`,
    )
  }
  return list
}

function stringList(value: unknown, key: string, file: string): readonly string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new BundleExclusionError(`${file}: "${key}" must be an array of strings`)
  }
  return value
}
