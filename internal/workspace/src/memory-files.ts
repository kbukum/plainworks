import type { WorkspaceFiles } from "./files"

/** An in-memory {@link WorkspaceFiles} that also exposes every file it holds after writes. */
export interface MemoryWorkspaceFiles extends WorkspaceFiles {
  /** The current files by repo-relative path, including any written since creation. */
  readonly files: ReadonlyMap<string, string>
}

/** An in-memory {@link WorkspaceFiles} built from a map of repo-relative path to file text. */
export function memoryWorkspaceFiles(
  initial: Readonly<Record<string, string>>,
): MemoryWorkspaceFiles {
  const files = new Map(Object.entries(initial))
  const children = (path: string, directories: boolean): string[] => {
    const prefix = path === "" || path === "." ? "" : `${path}/`
    const names = [...files.keys()]
      .filter((file) => file.startsWith(prefix))
      .map((file) => file.slice(prefix.length))
      .filter((rest) => rest.includes("/") === directories)
      .map((rest) => rest.split("/")[0] ?? "")
    return [...new Set(names)].sort()
  }
  return {
    files,
    readText: (path) => files.get(path),
    listDirectories: (path) => children(path, true),
    listFiles: (path) => children(path, false),
    writeText(path, text) {
      files.set(path, text)
    },
  }
}
