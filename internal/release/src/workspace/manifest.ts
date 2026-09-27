import { ReleaseToolError } from "../error"
import type { WorkspaceFiles } from "./files"

/** A workspace that is published to npm: `@plainworks/*` or `create-plainworks`, never private. */
export interface PublishableWorkspace {
  /** Repo-relative directory, e.g. `packages/std`. */
  readonly dir: string
  readonly name: string
  readonly version: string
  /** Names from `dependencies`, `peerDependencies`, and `optionalDependencies`, sorted. */
  readonly deps: readonly string[]
}

const RUNTIME_DEPENDENCY_FIELDS = ["dependencies", "peerDependencies", "optionalDependencies"]

/**
 * Lists every publishable workspace under the root manifest's `workspaces` globs, sorted by
 * directory. A directory without a `package.json` is skipped; an unreadable manifest fails.
 */
export function readPublishableWorkspaces(files: WorkspaceFiles): PublishableWorkspace[] {
  const found: PublishableWorkspace[] = []
  for (const dir of workspaceDirs(files)) {
    const manifest = readManifest(files, `${dir}/package.json`)
    if (manifest === undefined || !isPublishable(manifest)) continue
    const { name, version } = manifest
    if (typeof version !== "string") throw new ReleaseToolError(`${name} has no version`)
    found.push({ dir, name, version, deps: runtimeDependencies(manifest) })
  }
  return found.sort((a, b) => a.dir.localeCompare(b.dir))
}

type Manifest = Readonly<Record<string, unknown>>

function workspaceDirs(files: WorkspaceFiles): string[] {
  const root = readManifest(files, "package.json")
  if (root === undefined) throw new ReleaseToolError("The root package.json is missing")
  const { workspaces } = root
  if (!Array.isArray(workspaces)) {
    throw new ReleaseToolError("The root package.json has no workspaces array")
  }
  return workspaces.flatMap((pattern: unknown) => {
    if (typeof pattern !== "string" || !pattern.endsWith("/*") || pattern.includes("**")) {
      throw new ReleaseToolError(`Unsupported workspace glob: ${String(pattern)}`)
    }
    const base = pattern.slice(0, -2)
    return files.listDirectories(base).map((entry) => `${base}/${entry}`)
  })
}

function readManifest(files: WorkspaceFiles, path: string): Manifest | undefined {
  const text = files.readText(path)
  if (text === undefined) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (cause) {
    throw new ReleaseToolError(`${path} is not valid JSON`, { cause })
  }
  if (!isRecord(parsed)) throw new ReleaseToolError(`${path} is not a JSON object`)
  return parsed
}

function isPublishable(manifest: Manifest): manifest is Manifest & { name: string } {
  const { name } = manifest
  if (manifest.private === true || typeof name !== "string") return false
  return name.startsWith("@plainworks/") || name === "create-plainworks"
}

function runtimeDependencies(manifest: Manifest): string[] {
  const names = new Set<string>()
  for (const field of RUNTIME_DEPENDENCY_FIELDS) {
    const deps = manifest[field]
    if (isRecord(deps)) for (const name of Object.keys(deps)) names.add(name)
  }
  return [...names].sort()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
