// Regenerate `src/versions.ts` from the workspace: the bun `catalog:` (root `package.json`) plus the
// published `@plainworks/*` package versions. The initializer bakes these concrete versions into
// every generated `package.json`, because a standalone app cannot resolve `catalog:`/`workspace:`
// (those only exist inside this monorepo). `versions.test.ts` re-derives the same maps and fails on
// drift, so this file and the catalog can never disagree.
//
// Run: `node scripts/sync-versions.mjs` (or `bun run sync-versions`).

import { execFileSync } from "node:child_process"
import { readFileSync, realpathSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))
const repoRoot = dirname(dirname(packageDir))

/** Read and parse a JSON file. */
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

// Only git-tracked packages are real, released packages. This excludes transient scratch packages
// the golden generator drops into `packages/` during the CI generator smoke (e.g. smoke-server),
// which would otherwise be mistaken for publishable surfaces and pollute the pinned version map.
function trackedPackageManifests() {
  const tracked = execFileSync("git", ["ls-files", "packages/*/package.json"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
  return tracked.split("\n").filter((line) => line.length > 0)
}

/** The bun catalog: third-party name -> pinned range, straight from the root manifest. */
export function catalogVersions() {
  const root = readJson(join(repoRoot, "package.json"))
  return { ...root.catalog }
}

/** Every published `@plainworks/*` package -> its current version (private packages are skipped). */
export function plainworksVersions() {
  const versions = {}
  for (const manifestPath of trackedPackageManifests()) {
    let manifest
    try {
      manifest = readJson(join(repoRoot, manifestPath))
    } catch {
      continue
    }
    if (manifest.private === true || typeof manifest.name !== "string") continue
    if (!manifest.name.startsWith("@plainworks/")) continue
    versions[manifest.name] = manifest.version
  }
  return versions
}

/** Serialize a name -> version map with keys sorted, so the file is stable across regenerations. */
function sortedMap(map) {
  const sorted = {}
  for (const key of Object.keys(map).sort()) {
    sorted[key] = map[key]
  }
  return sorted
}

/** The generated `src/versions.json` contents: the two pinned maps a generated manifest draws from. */
export function renderVersions() {
  return `${JSON.stringify(
    { plainworks: sortedMap(plainworksVersions()), catalog: sortedMap(catalogVersions()) },
    null,
    2,
  )}\n`
}

/** Write `src/versions.json`. Exported helpers above are reused by the drift test. */
export function writeVersions() {
  writeFileSync(join(packageDir, "src", "versions.json"), renderVersions())
}

// Run `writeVersions` only when invoked directly (`node scripts/sync-versions.mjs`), not when
// imported. Compare resolved filesystem paths rather than a hand-built `file://` string, which is
// not portable (on Windows `process.argv[1]` is a drive path, `import.meta.url` a percent-encoded
// URL, so the string never matches).
const invokedPath = process.argv[1]
if (invokedPath !== undefined) {
  const modulePath = realpathSync(fileURLToPath(import.meta.url))
  if (modulePath === realpathSync(invokedPath)) {
    writeVersions()
  }
}
