import type { WorkspaceFiles } from "@plainworks/workspace"
import { ShapeError } from "./error"
import { type ConfigLoader, inspectWorkspaces } from "./inspect"
import { applyManifestProfile, checkWorkspace, manifestProfile, type ShapeIssue } from "./profile"

/** Lists every way the repository's workspaces break their profiles, sorted by directory. */
export async function checkShape(
  files: WorkspaceFiles,
  configs: ConfigLoader,
): Promise<ShapeIssue[]> {
  return (await inspectWorkspaces(files, configs)).flatMap(checkWorkspace)
}

/**
 * Writes the fields each profile derives into the named workspaces' `package.json` (every
 * workspace when `dirs` is omitted), and returns the directories it changed.
 */
export async function syncShape(
  files: WorkspaceFiles,
  configs: ConfigLoader,
  dirs?: readonly string[],
): Promise<string[]> {
  const workspaces = await inspectWorkspaces(files, configs)
  const known = new Set(workspaces.map((facts) => facts.dir))
  const missing = dirs?.find((dir) => !known.has(dir))
  if (missing !== undefined) throw new ShapeError(`${missing} is not a workspace`)
  const changed: string[] = []
  for (const facts of workspaces) {
    if (dirs !== undefined && !dirs.includes(facts.dir)) continue
    const current = `${JSON.stringify(facts.manifest, null, 2)}\n`
    const synced = applyManifestProfile(facts.manifest, manifestProfile(facts))
    const text = `${JSON.stringify(synced, null, 2)}\n`
    if (text === current) continue
    files.writeText(`${facts.dir}/package.json`, text)
    changed.push(facts.dir)
  }
  return changed
}
