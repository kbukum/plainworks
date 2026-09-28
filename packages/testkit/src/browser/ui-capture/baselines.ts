import { createHash } from "node:crypto"
import { posix } from "node:path"
import type { Flow } from "../flow/definition"
import type { MatrixPresetName } from "../flow/matrix/presets"
import type { ArtifactStore, FlowRun } from "../flow/report/artifacts"
import { parseFlowReport } from "../flow/report/parse"
import type { FlowReport } from "../flow/report/schema"

/** How many captured git bases a machine keeps before evicting the least recently used. */
export const DEFAULT_KEPT_BASES = 3

/** Where `ui:capture` keeps its baselines under the artifact root. */
export const uiCapturePaths: {
  readonly snapshot: (root: string, name: string) => string
  readonly bases: (root: string) => string
  readonly base: (root: string, key: string) => string
} = {
  snapshot: (root, name) => posix.join(root, "snapshots", name),
  bases: (root) => posix.join(root, "bases"),
  base: (root, key) => posix.join(root, "bases", key),
}

/** Why a captured git base is kept, and when it was last compared against. */
export interface BaseUse {
  readonly commit: string
  readonly ref: string
  readonly usedAt: number
}

/**
 * The cache key of a git base: the commit, a hash of the flows, and the preset. The base replays
 * the current checkout's flows against the old commit, so a changed flow step captures anew.
 */
export function baseCacheKey(options: {
  readonly commit: string
  readonly flows: readonly Flow[]
  readonly preset: MatrixPresetName
}): string {
  const source = JSON.stringify(options.flows, (_key, value: unknown) =>
    typeof value === "function" || value instanceof RegExp ? String(value) : value,
  )
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 12)
  return `${options.commit.slice(0, 12)}-${hash}-${options.preset}`
}

/** The report a stored run published, or `undefined` when the run never finished. */
export async function readStoredReport(
  store: ArtifactStore,
  dir: string,
): Promise<FlowReport | undefined> {
  if (!(await store.list(dir)).includes("report.json")) return undefined
  return parseFlowReport(JSON.parse(await store.read(posix.join(dir, "report.json"))))
}

/** Save a finished run as the snapshot `name`, replacing any older one, and return its path. */
export async function saveSnapshot(
  store: ArtifactStore,
  root: string,
  run: FlowRun,
  name: string,
): Promise<string> {
  const dir = uiCapturePaths.snapshot(root, name)
  await store.copy(run.dir, dir)
  return dir
}

/** Record that the base at `dir` was just compared against, for least-recently-used eviction. */
export async function recordBaseUse(
  store: ArtifactStore,
  dir: string,
  use: BaseUse,
): Promise<void> {
  await store.write(posix.join(dir, "meta.json"), `${JSON.stringify(use, null, 2)}\n`)
}

/**
 * Remove captured bases beyond `keep`, least recently used first, never the one `inUse`. A base
 * with no readable use record is the oldest. Returns the keys removed.
 */
export async function evictBases(
  store: ArtifactStore,
  root: string,
  options: { readonly keep?: number; readonly inUse?: string } = {},
): Promise<string[]> {
  const dir = uiCapturePaths.bases(root)
  const entries = []
  for (const key of await store.list(dir)) {
    entries.push({ key, usedAt: await usedAt(store, posix.join(dir, key)) })
  }
  const evicted = planBaseEviction(entries, options.keep ?? DEFAULT_KEPT_BASES, options.inUse)
  for (const key of evicted) await store.remove(posix.join(dir, key))
  return evicted.sort()
}

/** The keys to evict so no more than `keep` remain, keeping the most recent and `inUse`. */
export function planBaseEviction(
  entries: readonly { readonly key: string; readonly usedAt: number }[],
  keep: number,
  inUse?: string,
): string[] {
  const ranked = [...entries].sort((a, b) =>
    a.key === inUse ? -1 : b.key === inUse ? 1 : b.usedAt - a.usedAt,
  )
  return ranked.slice(keep).map((entry) => entry.key)
}

async function usedAt(store: ArtifactStore, dir: string): Promise<number> {
  try {
    const meta: unknown = JSON.parse(await store.read(posix.join(dir, "meta.json")))
    if (typeof meta === "object" && meta !== null && "usedAt" in meta) {
      return typeof meta.usedAt === "number" ? meta.usedAt : 0
    }
    return 0
  } catch {
    // No use record, or a torn one from an interrupted capture: evict it first.
    return 0
  }
}
