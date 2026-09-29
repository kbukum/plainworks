import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

/**
 * The repository access the dev tools need. Paths are repo-relative with `/` separators. Tests pass
 * {@link memoryWorkspaceFiles}; a CLI passes {@link nodeWorkspaceFiles}.
 */
export interface WorkspaceFiles {
  /** Returns the file's text, or `undefined` when it does not exist. */
  readText(path: string): string | undefined
  /** Returns the names of the directories directly inside `path`, sorted. */
  listDirectories(path: string): readonly string[]
  /** Returns the names of the files directly inside `path`, sorted. */
  listFiles(path: string): readonly string[]
  /** Writes `text` to `path`, creating its directory when needed. */
  writeText(path: string, text: string): void
}

/** Reads and writes the repository rooted at `repoRoot` on disk. */
export function nodeWorkspaceFiles(repoRoot: string): WorkspaceFiles {
  const list = (path: string, directories: boolean): string[] => {
    const base = join(repoRoot, path)
    return readdirSync(base)
      .filter((entry) => statSync(join(base, entry)).isDirectory() === directories)
      .sort()
  }
  return {
    readText(path) {
      try {
        return readFileSync(join(repoRoot, path), "utf8")
      } catch (error) {
        if (isMissingFile(error)) return undefined
        throw error
      }
    },
    listDirectories: (path) => list(path, true),
    listFiles: (path) => list(path, false),
    writeText(path, text) {
      mkdirSync(dirname(join(repoRoot, path)), { recursive: true })
      writeFileSync(join(repoRoot, path), text)
    },
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT"
}
