import { isRecord } from "@plainworks/std"
import { BundleExclusionError } from "./error"
import type { RuleSpec } from "./rules"
import type { ExclusionRule } from "./scan"

/** The file-system operations {@link resolveRule} needs. */
export interface ResolveEnvironment {
  join(...parts: readonly string[]): string
  dirname(path: string): string
  exists(path: string): boolean
  realpath(path: string): string
  readText(path: string): string
}

const APP_PATH = /^\.\.?\//
const MANIFEST_FIELD = /^(.+\.json)#([\w$-]+)$/

/**
 * Turn a rule spec into absolute paths the scan can match, relative to `base` (the config file's
 * directory). App paths join `base`; a package path resolves through the nearest `node_modules`
 * to the package's real folder, so a workspace link and a registry install both work. An unmapped
 * glob joins `base`; a `manifest.json#field` entry reads the files that field lists.
 */
export function resolveRule(spec: RuleSpec, base: string, env: ResolveEnvironment): ExclusionRule {
  const source = (entry: string): string => resolveSource(entry, base, env)
  return {
    forbiddenSources: spec.forbiddenSources.map(source),
    markers: spec.markers,
    expectedSources: spec.expectedSources.map(source),
    allowUnmapped: spec.allowUnmapped.flatMap((entry) => resolveUnmapped(entry, base, env)),
  }
}

function resolveSource(entry: string, base: string, env: ResolveEnvironment): string {
  if (APP_PATH.test(entry)) return withSlash(env.join(base, entry), entry)
  const segments = entry.split("/")
  const nameLength = entry.startsWith("@") ? 2 : 1
  const name = segments.slice(0, nameLength).join("/")
  const rest = segments.slice(nameLength).join("/")
  const root = findPackage(name, base, env)
  if (root === undefined) {
    throw new BundleExclusionError(
      `"${entry}" names the package ${name}, which is not installed; start an app path with "./"`,
    )
  }
  return rest === "" ? `${root}/` : withSlash(env.join(root, rest), rest)
}

function findPackage(name: string, from: string, env: ResolveEnvironment): string | undefined {
  let directory = from
  for (;;) {
    const candidate = env.join(directory, "node_modules", name)
    if (env.exists(candidate)) return env.realpath(candidate)
    const parent = env.dirname(directory)
    if (parent === directory) return undefined
    directory = parent
  }
}

function resolveUnmapped(entry: string, base: string, env: ResolveEnvironment): string[] {
  const reference = entry.match(MANIFEST_FIELD)
  if (reference === null) return [env.join(base, entry)]
  const [, manifest = "", field = ""] = reference
  const path = env.join(base, manifest)
  let parsed: unknown
  try {
    parsed = JSON.parse(env.readText(path))
  } catch (error) {
    throw new BundleExclusionError(`${entry}: cannot read the manifest`, { cause: error })
  }
  const listed = isRecord(parsed) ? parsed[field] : undefined
  if (!Array.isArray(listed) || !listed.every((file) => typeof file === "string")) {
    throw new BundleExclusionError(`${entry}: "${field}" must be an array of strings`)
  }
  const directory = env.dirname(path)
  return listed.map((file: string) => env.join(directory, file))
}

// `join` drops a trailing slash, which is what keeps `devtools/` from matching `devtools-lite/`.
function withSlash(path: string, entry: string): string {
  return entry.endsWith("/") && !path.endsWith("/") ? `${path}/` : path
}
