import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * The read-only view of the repository the release tooling needs. Paths are repo-relative with `/`
 * separators. Tests pass an in-memory implementation; the CLI passes {@link nodeWorkspaceFiles}.
 */
export interface WorkspaceFiles {
  /** Returns the file's text, or `undefined` when it does not exist. */
  readText(path: string): string | undefined
  /** Returns the names of the directories directly inside `path`. */
  listDirectories(path: string): readonly string[]
}

/** Reads the repository rooted at `repoRoot` from disk. */
export function nodeWorkspaceFiles(repoRoot: string): WorkspaceFiles {
  return {
    readText(path) {
      try {
        return readFileSync(join(repoRoot, path), "utf8")
      } catch (error) {
        if (isMissingFile(error)) return undefined
        throw error
      }
    },
    listDirectories(path) {
      const base = join(repoRoot, path)
      return readdirSync(base).filter((entry) => statSync(join(base, entry)).isDirectory())
    },
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}
