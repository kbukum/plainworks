import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { CATALOG_VERSIONS, PLAINWORKS_VERSIONS } from "./versions"

// Independent drift check: re-derive the version maps straight from the workspace and assert the
// generated `versions.ts` matches. If the catalog or a package version changes without rerunning
// `bun run sync-versions`, this fails — so a generated project can never carry a stale pin.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")

interface Manifest {
  readonly name?: string
  readonly version?: string
  readonly private?: boolean
  readonly catalog?: Record<string, string>
}

function readManifest(path: string): Manifest {
  return JSON.parse(readFileSync(path, "utf8")) as Manifest
}

// Only git-tracked packages are real, released packages. This excludes the transient scratch
// packages the golden generator drops into `packages/` during the CI generator smoke, which would
// otherwise be mistaken for publishable surfaces and fail this check against the pinned map.
function trackedPackageManifests(): readonly string[] {
  const tracked = execFileSync("git", ["ls-files", "packages/*/package.json"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
  return tracked.split("\n").filter((line) => line.length > 0)
}

function expectedCatalog(): Record<string, string> {
  return { ...readManifest(join(repoRoot, "package.json")).catalog }
}

function expectedPlainworks(): Record<string, string> {
  const versions: Record<string, string> = {}
  for (const manifestPath of trackedPackageManifests()) {
    let manifest: Manifest
    try {
      manifest = readManifest(join(repoRoot, manifestPath))
    } catch {
      continue
    }
    if (manifest.private === true) continue
    if (manifest.name === undefined || !manifest.name.startsWith("@plainworks/")) continue
    versions[manifest.name] = manifest.version ?? ""
  }
  return versions
}

describe("versions map", () => {
  it("matches the bun catalog", () => {
    expect(CATALOG_VERSIONS).toEqual(expectedCatalog())
  })

  it("matches the published @plainworks package versions", () => {
    expect(PLAINWORKS_VERSIONS).toEqual(expectedPlainworks())
  })
})
