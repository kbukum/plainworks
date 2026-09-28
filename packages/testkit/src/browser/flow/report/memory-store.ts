import type { ArtifactStore } from "./artifacts"

/** An {@link ArtifactStore} held in memory, with read-only views of what it holds. */
export interface MemoryArtifactStore extends ArtifactStore {
  /** Every file by path. */
  readonly files: ReadonlyMap<string, string | Uint8Array>
  /** Every directory created explicitly; others are implied by the files under them. */
  readonly dirs: ReadonlySet<string>
  /** Every link by path, to its target. */
  readonly links: ReadonlyMap<string, string>
}

/**
 * An in-memory {@link ArtifactStore}, so run layout, retention, snapshots, and reviews are
 * testable without a disk. Directories exist when created or when a file sits under them.
 */
export function memoryArtifactStore(): MemoryArtifactStore {
  const files = new Map<string, string | Uint8Array>()
  const dirs = new Set<string>()
  const links = new Map<string, string>()
  const under = (path: string) => [...files.keys()].filter((file) => file.startsWith(`${path}/`))
  const bytesOf = (path: string): Uint8Array => {
    const data = files.get(path)
    if (data === undefined) throw Object.assign(new Error(`ENOENT ${path}`), { code: "ENOENT" })
    return typeof data === "string" ? new TextEncoder().encode(data) : data
  }
  const store: MemoryArtifactStore = {
    files,
    dirs,
    links,
    async createDir(path) {
      if (dirs.has(path)) return false
      dirs.add(path)
      return true
    },
    async write(path, data, signal) {
      signal?.throwIfAborted()
      files.set(path, data)
    },
    read: async (path) => new TextDecoder().decode(bytesOf(path)),
    readBytes: async (path) => bytesOf(path),
    async list(path) {
      const names = new Set<string>()
      for (const entry of [...dirs, ...files.keys()]) {
        if (entry.startsWith(`${path}/`)) {
          names.add(entry.slice(path.length + 1).split("/")[0] ?? "")
        }
      }
      return [...names].sort()
    },
    async size(path) {
      return under(path).reduce((total, file) => total + bytesOf(file).byteLength, 0)
    },
    async remove(path) {
      files.delete(path)
      for (const file of under(path)) files.delete(file)
      for (const dir of [...dirs]) if (dir === path || dir.startsWith(`${path}/`)) dirs.delete(dir)
    },
    async copy(from, to) {
      await store.remove(to)
      for (const file of under(from)) files.set(`${to}${file.slice(from.length)}`, bytesOf(file))
      for (const dir of [...dirs]) {
        if (dir === from || dir.startsWith(`${from}/`)) dirs.add(`${to}${dir.slice(from.length)}`)
      }
    },
    async link(target, path) {
      links.set(path, target)
    },
  }
  return store
}
