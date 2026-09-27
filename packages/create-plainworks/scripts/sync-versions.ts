// Regenerate `src/versions.json` from the workspace: the bun `catalog:` (root `package.json`) plus
// the published `@plainworks/*` package versions. The initializer bakes these concrete versions
// into every generated `package.json`, because a standalone app cannot resolve
// `catalog:`/`workspace:` (those only exist inside this monorepo). `versions.test.ts` re-derives
// the same maps and fails on drift, so this file and the catalog can never disagree.
//
// Run: `bun scripts/sync-versions.ts` (or `bun run sync-versions`).

import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

interface Manifest {
  readonly name?: unknown
  readonly version?: unknown
  readonly private?: unknown
  readonly catalog?: unknown
}

type VersionMap = Record<string, string>

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))
const repoRoot = dirname(dirname(packageDir))

function readManifest(path: string): Manifest {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"))
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`${path} is not a JSON object`)
  }
  return parsed
}

function isVersionMap(value: unknown): value is VersionMap {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === "string")
  )
}

// Only git-tracked packages are real, released packages. This excludes transient scratch packages
// the golden generator drops into `packages/` during the CI generator smoke (e.g. smoke-server),
// which would otherwise be mistaken for publishable surfaces and pollute the pinned version map.
function trackedPackageManifests(): readonly string[] {
  const tracked = execFileSync("git", ["ls-files", "packages/*/package.json"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
  return tracked.split("\n").filter((line) => line.length > 0)
}

/** The bun catalog: third-party name -> pinned range, straight from the root manifest. */
function catalogVersions(): VersionMap {
  const { catalog } = readManifest(join(repoRoot, "package.json"))
  if (!isVersionMap(catalog)) throw new Error("root package.json has no string catalog")
  return { ...catalog }
}

/** Every published `@plainworks/*` package -> its current version (private packages are skipped). */
function plainworksVersions(): VersionMap {
  const versions: VersionMap = {}
  for (const manifestPath of trackedPackageManifests()) {
    const manifest = readManifest(join(repoRoot, manifestPath))
    if (manifest.private === true || typeof manifest.name !== "string") continue
    if (!manifest.name.startsWith("@plainworks/")) continue
    if (typeof manifest.version !== "string") {
      throw new Error(`${manifestPath} has no version`)
    }
    versions[manifest.name] = manifest.version
  }
  return versions
}

/** Copy a name -> version map with keys sorted, so the file is stable across regenerations. */
function sortedMap(map: VersionMap): VersionMap {
  const sorted: VersionMap = {}
  for (const key of Object.keys(map).sort()) {
    sorted[key] = map[key] as string
  }
  return sorted
}

const rendered = `${JSON.stringify(
  { plainworks: sortedMap(plainworksVersions()), catalog: sortedMap(catalogVersions()) },
  null,
  2,
)}\n`
writeFileSync(join(packageDir, "src", "versions.json"), rendered)
