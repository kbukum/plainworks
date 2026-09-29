import { isRecord } from "@plainworks/std"
import type { WorkspaceFiles } from "./files"

/** A repository layout the dev tools cannot read: a missing or malformed manifest or glob. */
export class WorkspaceError extends Error {
  override readonly name = "WorkspaceError"
}

/** A parsed `package.json`. */
export type Manifest = Readonly<Record<string, unknown>>

/** One workspace: its repo-relative directory (e.g. `packages/std`) and its manifest. */
export interface Workspace {
  readonly dir: string
  readonly manifest: Manifest
}

/**
 * Lists every workspace under the root manifest's `workspaces` globs, sorted by directory. A
 * directory without a `package.json` is skipped; an unreadable manifest fails.
 */
export function listWorkspaces(files: WorkspaceFiles): Workspace[] {
  const found: Workspace[] = []
  for (const dir of workspaceDirs(files)) {
    const manifest = readJsonObject(files, `${dir}/package.json`)
    if (manifest !== undefined) found.push({ dir, manifest })
  }
  return found.sort((a, b) => a.dir.localeCompare(b.dir))
}

/** Parses a JSON object file, or returns `undefined` when it does not exist. */
export function readJsonObject(files: WorkspaceFiles, path: string): Manifest | undefined {
  const text = files.readText(path)
  if (text === undefined) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (cause) {
    throw new WorkspaceError(`${path} is not valid JSON`, { cause })
  }
  if (!isRecord(parsed)) throw new WorkspaceError(`${path} is not a JSON object`)
  return parsed
}

function workspaceDirs(files: WorkspaceFiles): string[] {
  const root = readJsonObject(files, "package.json")
  if (root === undefined) throw new WorkspaceError("The root package.json is missing")
  const { workspaces } = root
  if (!Array.isArray(workspaces)) {
    throw new WorkspaceError("The root package.json has no workspaces array")
  }
  return workspaces.flatMap((pattern: unknown) => {
    if (typeof pattern !== "string" || !pattern.endsWith("/*") || pattern.includes("**")) {
      throw new WorkspaceError(`Unsupported workspace glob: ${String(pattern)}`)
    }
    const base = pattern.slice(0, -2)
    return files.listDirectories(base).map((entry) => `${base}/${entry}`)
  })
}
