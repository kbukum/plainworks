import { readdirSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { RULES } from "./rules"
import { type Artifact, describeLeak, isArtifact, mergeRules, scanArtifacts } from "./scan"

/*
 * Usage: bun cli.ts <config.json>
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

interface HostConfig {
  readonly rule: string
  readonly directories: readonly string[]
  readonly forbiddenSources: readonly string[]
  readonly markers: readonly string[]
  readonly expectedSources: readonly string[]
  readonly allowUnmapped: readonly string[]
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function stringList(value: unknown, key: string, file: string): readonly string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    fail(`${file}: "${key}" must be an array of strings`)
  }
  return value
}

function readConfig(file: string): HostConfig {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"))
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    fail(`${file}: expected a JSON object`)
  }
  const config = parsed as Record<string, unknown>
  if (typeof config.rule !== "string" || !Object.hasOwn(RULES, config.rule)) {
    fail(`${file}: "rule" must be one of ${Object.keys(RULES).join(", ")}`)
  }
  const directories = stringList(config.directories, "directories", file)
  if (directories.length === 0) fail(`${file}: "directories" must name the build output`)
  const expectedSources = stringList(config.expectedSources, "expectedSources", file)
  if (expectedSources.length === 0) {
    fail(`${file}: "expectedSources" must name at least one of the app's own source paths`)
  }
  return {
    rule: config.rule,
    directories,
    forbiddenSources: stringList(config.forbiddenSources, "forbiddenSources", file),
    markers: stringList(config.markers, "markers", file),
    expectedSources,
    allowUnmapped: stringList(config.allowUnmapped, "allowUnmapped", file),
  }
}

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return walk(path)
    return isArtifact(path) ? [path] : []
  })
}

function readArtifacts(directory: string): Artifact[] {
  let paths: string[]
  try {
    paths = walk(directory)
  } catch (error) {
    fail(`Cannot read ${directory} (${String(error)}); run the host's production build first`)
  }
  if (!paths.some((path) => path.endsWith(".map"))) {
    fail(`${directory} has no source maps; enable them for the production build`)
  }
  return paths.map((path) => ({ path, text: readFileSync(path, "utf8") }))
}

const configArg = process.argv[2]
if (configArg === undefined) fail("Usage: bun cli.ts <config.json>")
const configFile = resolve(configArg)
const config = readConfig(configFile)
const base = dirname(configFile)
const rule = mergeRules(RULES[config.rule] ?? {}, config)

const artifacts = config.directories.flatMap((directory) =>
  readArtifacts(isAbsolute(directory) ? directory : join(base, directory)),
)
const { leaks, unmapped } = scanArtifacts(artifacts, rule)
const label = relative(process.cwd(), configFile)
if (leaks.length > 0) {
  for (const leak of leaks.slice(0, 20)) process.stderr.write(`${describeLeak(leak)}\n`)
  if (leaks.length > 20) process.stderr.write(`…and ${leaks.length - 20} more\n`)
  fail(`${label}: the production build is not clean`)
}
process.stdout.write(
  `${label}: production build excludes ${config.rule} ` +
    `(${artifacts.length} files; ${unmapped.length} allowed unmapped scripts marker-checked)\n`,
)
