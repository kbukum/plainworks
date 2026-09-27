import type { WorkspaceFiles } from "./files"

/** An in-memory {@link WorkspaceFiles} built from a map of repo-relative path to file text. */
export function memoryWorkspaceFiles(files: Readonly<Record<string, string>>): WorkspaceFiles {
  const paths = Object.keys(files)
  return {
    readText: (path) => files[path],
    listDirectories(path) {
      const prefix = `${path}/`
      const names = paths
        .filter((file) => file.startsWith(prefix) && file.slice(prefix.length).includes("/"))
        .map((file) => file.slice(prefix.length).split("/")[0] ?? "")
      return [...new Set(names)].sort()
    },
  }
}
