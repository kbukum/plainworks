import { lstat, mkdir, readdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises"
import { posix } from "node:path"
import { FlowError } from "../errors"
import { renderFlowReportMarkdown } from "./markdown"
import { parseFlowDeviceReport } from "./parse"
import { DEFAULT_RETENTION, planRunRetention, type RetentionPolicy } from "./retention"
import { FLOW_REPORT_SCHEMA_VERSION, type FlowReport } from "./schema"
import { summarizeFlowRuns } from "./summary"

/**
 * The file operations flow output runs through, injectable so the layout and retention logic is
 * testable without a disk. Paths are POSIX, absolute or relative to the working directory.
 */
export interface ArtifactStore {
  /** Create a directory and its parents; `false` when it already exists. */
  createDir(path: string): Promise<boolean>
  /** Write a file, creating its parent directories. `signal` stops a write still under way. */
  write(path: string, data: string | Uint8Array, signal?: AbortSignal): Promise<void>
  read(path: string): Promise<string>
  /** The names in a directory, or none when it does not exist. */
  list(path: string): Promise<string[]>
  /** The bytes a directory holds, counted without following links. */
  size(path: string): Promise<number>
  /** Remove a file or directory tree. */
  remove(path: string): Promise<void>
  /** Point the link at `path` to `target` (relative to the link), replacing any old link. */
  link(target: string, path: string): Promise<void>
}

/** A started run: its id and its directory. */
export interface FlowRun {
  readonly id: string
  readonly dir: string
}

/**
 * The environment variable that hands a run directory from a Playwright `globalSetup` to its
 * workers, so every test of one invocation writes into the same run.
 */
export const FLOW_RUN_ENV = "PLAINWORKS_FLOW_RUN_DIR"

/** Where each file of a run lives, relative to the run directory. */
export const flowArtifactPaths: {
  readonly checkpoint: (at: CheckpointLocation) => string
  readonly variant: (at: CheckpointLocation, variant: string, extension: string) => string
  readonly entry: (flow: string, device: string) => string
} = {
  checkpoint: ({ flow, device, index, checkpoint }) =>
    `flows/${flow}/${device}/${String(index + 1).padStart(2, "0")}-${checkpoint}`,
  variant: (at, variant, extension) =>
    `${flowArtifactPaths.checkpoint(at)}/${variant}.${extension}`,
  entry: (flow, device) => `entries/${flow}--${device}.json`,
}

/** One checkpoint of one flow on one device, as the artifact layout addresses it. */
export interface CheckpointLocation {
  readonly flow: string
  readonly device: string
  readonly index: number
  readonly checkpoint: string
}

/** Writes files inside one run directory. */
export interface FlowRunWriter {
  readonly dir: string
  /**
   * Write `data` at `relative` inside the run and return that relative path. `signal` stops a
   * write still under way, so a timed-out step never writes into the run after it gave up.
   */
  write(relative: string, data: string | Uint8Array, signal?: AbortSignal): Promise<string>
}

// A clock collision (two runs in one millisecond) gets a numbered suffix; this bounds the search.
const MAX_RUN_ID_ATTEMPTS = 100

/**
 * Start a run: create `<root>/runs/<id>`, where the id is the start time, so ids sort in time
 * order. The directory is created exclusively, so two runs never share one.
 */
export async function startFlowRun(options: {
  readonly root: string
  readonly now?: () => number
  readonly store?: ArtifactStore
}): Promise<FlowRun> {
  const store = options.store ?? nodeArtifactStore
  const stamp = new Date((options.now ?? Date.now)()).toISOString().replace(/[:.]/g, "-")
  for (let attempt = 0; attempt < MAX_RUN_ID_ATTEMPTS; attempt++) {
    const id = attempt === 0 ? stamp : `${stamp}-${attempt}`
    const dir = posix.join(options.root, "runs", id)
    if (await store.createDir(dir)) return { id, dir }
  }
  throw new FlowError("report", `Could not create a run directory under ${options.root}/runs`)
}

/**
 * Open a writer for the run at `dir`. It refuses any path that could leave the run: an absolute
 * path, a `..` segment, or a backslash, which Windows would read as a separator.
 */
export function openFlowRun(dir: string, store: ArtifactStore = nodeArtifactStore): FlowRunWriter {
  return {
    dir,
    async write(relative, data, signal) {
      if (
        relative.includes("\\") ||
        posix.isAbsolute(relative) ||
        relative.split("/").includes("..")
      ) {
        throw new FlowError("report", `Run artifact path leaves the run directory: "${relative}"`)
      }
      const normalized = posix.normalize(relative)
      await store.write(posix.join(dir, normalized), data, signal)
      return normalized
    },
  }
}

/**
 * Finish a run: merge every stored entry into `report.json` and `report.md`, point
 * `<root>/latest` at the run, and prune old runs by `retention`. Entries are validated, so a
 * malformed one fails with a `flow/report` {@link FlowError} rather than merging silently.
 */
export async function finishFlowRun(options: {
  readonly root: string
  readonly run: FlowRun
  readonly now?: () => number
  readonly retention?: RetentionPolicy
  readonly store?: ArtifactStore
}): Promise<FlowReport> {
  const store = options.store ?? nodeArtifactStore
  const { run } = options
  const entriesDir = posix.join(run.dir, "entries")
  const names = (await store.list(entriesDir)).filter((name) => name.endsWith(".json"))
  const runs = []
  for (const name of names) {
    const raw = await store.read(posix.join(entriesDir, name))
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch (cause) {
      throw new FlowError("report", `Run entry ${name} is not valid JSON`, { cause })
    }
    runs.push(parseFlowDeviceReport(value))
  }
  runs.sort((a, b) => (a.flow === b.flow ? compare(a.device, b.device) : compare(a.flow, b.flow)))

  const report: FlowReport = {
    schemaVersion: FLOW_REPORT_SCHEMA_VERSION,
    runId: run.id,
    createdAt: new Date((options.now ?? Date.now)()).toISOString(),
    summary: summarizeFlowRuns(runs),
    runs,
  }
  await store.write(posix.join(run.dir, "report.json"), `${JSON.stringify(report, null, 2)}\n`)
  await store.write(posix.join(run.dir, "report.md"), renderFlowReportMarkdown(report))
  await store.link(posix.join("runs", run.id), posix.join(options.root, "latest"))

  const runsDir = posix.join(options.root, "runs")
  const stored = []
  for (const id of await store.list(runsDir)) {
    stored.push({ id, bytes: await store.size(posix.join(runsDir, id)) })
  }
  for (const id of planRunRetention(stored, options.retention ?? DEFAULT_RETENTION, run.id)) {
    await store.remove(posix.join(runsDir, id))
  }
  return report
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

const isErrno = (error: unknown, code: string): boolean =>
  error instanceof Error && "code" in error && error.code === code

/** The real store, on the local file system. */
export const nodeArtifactStore: ArtifactStore = {
  async createDir(path) {
    await mkdir(posix.dirname(path), { recursive: true })
    try {
      await mkdir(path)
      return true
    } catch (error) {
      if (isErrno(error, "EEXIST")) return false
      throw error
    }
  },
  async write(path, data, signal) {
    signal?.throwIfAborted()
    await mkdir(posix.dirname(path), { recursive: true })
    await writeFile(path, data, signal === undefined ? {} : { signal })
  },
  read: (path) => readFile(path, "utf8"),
  async list(path) {
    try {
      return (await readdir(path)).sort()
    } catch (error) {
      if (isErrno(error, "ENOENT")) return []
      throw error
    }
  },
  async size(path) {
    const stat = await lstat(path)
    if (!stat.isDirectory()) return stat.size
    let total = 0
    for (const name of await readdir(path))
      total += await nodeArtifactStore.size(posix.join(path, name))
    return total
  },
  remove: (path) => rm(path, { recursive: true, force: true }),
  async link(target, path) {
    // A new link under a temporary name, renamed over the old one, so `latest` is never missing.
    const temporary = `${path}.${process.pid}.tmp`
    await rm(temporary, { force: true })
    await symlink(target, temporary, "dir")
    await rename(temporary, path)
  },
}
