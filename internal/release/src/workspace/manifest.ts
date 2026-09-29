import { isRecord } from "@plainworks/std"
import { listWorkspaces, type Manifest, type WorkspaceFiles } from "@plainworks/workspace"
import { ReleaseToolError } from "../error"

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

/** Lists every publishable workspace, sorted by directory. */
export function readPublishableWorkspaces(files: WorkspaceFiles): PublishableWorkspace[] {
  return listWorkspaces(files).flatMap(({ dir, manifest }) => {
    if (!isPublishable(manifest)) return []
    const { name, version } = manifest
    if (typeof version !== "string") throw new ReleaseToolError(`${name} has no version`)
    return [{ dir, name, version, deps: runtimeDependencies(manifest) }]
  })
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
