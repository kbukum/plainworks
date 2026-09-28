import type { DeviceId } from "../flow/matrix/devices"
import {
  type ArtifactStore,
  type FlowRunWriter,
  flowArtifactPaths,
  nodeArtifactStore,
} from "../flow/report/artifacts"
import type {
  ChangeReview,
  ChangeStatus,
  FlowReport,
  FrameChange,
  ReviewBase,
  VariantReport,
} from "../flow/report/schema"
import { diffAriaSnapshots } from "./aria-diff"
import { diffFrames, type FrameDiffOptions } from "./frame-diff"

/** A finished run: its report, and the directory its paths are relative to. */
export interface ReviewedRun {
  readonly report: FlowReport
  readonly dir: string
}

/** Options for {@link reviewChanges}. */
export interface ReviewChangesOptions {
  /** The base run, and where it came from. */
  readonly base: ReviewedRun & { readonly source: Omit<ReviewBase, "runId"> }
  readonly current: ReviewedRun
  /** Writes the review's files into the current run. */
  readonly writer: FlowRunWriter
  /** Reads both runs' frames and ARIA trees. Defaults to the local file system. */
  readonly store?: ArtifactStore
  readonly diff?: FrameDiffOptions
  readonly signal?: AbortSignal
}

/** One captured variant, addressed by flow, device, checkpoint, and variant id. */
interface Captured {
  readonly key: string
  readonly flow: string
  readonly device: DeviceId
  readonly index: number
  readonly checkpoint: string
  readonly variant: VariantReport & { readonly frame: string }
}

/**
 * Compare a run's frames and ARIA trees with a base run's, variant by variant. A frame is
 * `changed` when its pixels differ beyond noise or its ARIA tree differs, `added` when only this
 * run has it, and `removed` when only the base has it and its flow ran cleanly on that device. A
 * base frame whose flow errored or was not selected is only counted as `not-captured`. For every
 * change it writes the base frame,
 * a diff image, and an ARIA line diff into the current run, one change at a time, so no more than
 * two frames are in memory. A review is skipped, never failed, when either run captured nothing.
 */
export async function reviewChanges(options: ReviewChangesOptions): Promise<ChangeReview> {
  const { base, current, writer, signal } = options
  const store = options.store ?? nodeArtifactStore
  const baseName = `${base.source.name} (${base.report.runId})`
  const before = captured(base.report)
  const after = captured(current.report)
  if (before.size === 0) {
    return {
      status: "skipped",
      reason: `The base run ${baseName} captured no frames: save it with ui:check, which captures`,
    }
  }
  if (after.size === 0) {
    return { status: "skipped", reason: "This run captured no frames to compare" }
  }

  const totals: Record<ChangeStatus, number> = {
    unchanged: 0,
    changed: 0,
    added: 0,
    removed: 0,
    "not-captured": 0,
  }
  const cleanRuns = new Set(
    current.report.runs.filter((run) => run.error === undefined).map(runKey),
  )
  const changes: FrameChange[] = []
  const read = (dir: string, path: string) => store.readBytes(`${dir}/${path}`)
  const readText = (dir: string, path: string) => store.read(`${dir}/${path}`)
  const copyBefore = async (item: Captured) =>
    writer.write(
      flowArtifactPaths.review(item, item.variant.id, "before.png"),
      await read(base.dir, item.variant.frame),
      signal,
    )

  for (const [key, now] of after) {
    signal?.throwIfAborted()
    const then = before.get(key)
    if (then === undefined) {
      totals.added++
      changes.push({ ...where(now), status: "added", after: now.variant.frame })
      continue
    }
    const pixels = diffFrames(
      await read(base.dir, then.variant.frame),
      await read(current.dir, now.variant.frame),
      options.diff,
    )
    const aria =
      then.variant.aria === undefined || now.variant.aria === undefined
        ? undefined
        : diffAriaSnapshots(
            await readText(base.dir, then.variant.aria),
            await readText(current.dir, now.variant.aria),
          )
    if (!pixels.changed && aria?.changed !== true) {
      totals.unchanged++
      continue
    }
    totals.changed++
    const diff =
      pixels.image === undefined
        ? undefined
        : await writer.write(
            flowArtifactPaths.review(now, now.variant.id, "diff.png"),
            pixels.image,
            signal,
          )
    const ariaDiff =
      aria?.changed === true
        ? await writer.write(
            flowArtifactPaths.review(now, now.variant.id, "aria.diff"),
            `${aria.diff}\n`,
            signal,
          )
        : undefined
    changes.push({
      ...where(now),
      status: "changed",
      pixels: { different: pixels.different, total: pixels.total, sizeChanged: pixels.sizeChanged },
      ...(aria === undefined ? {} : { ariaChanged: aria.changed }),
      before: await copyBefore(then),
      after: now.variant.frame,
      ...(diff === undefined ? {} : { diff }),
      ...(ariaDiff === undefined ? {} : { ariaDiff }),
    })
  }
  for (const [key, then] of before) {
    if (after.has(key)) continue
    if (!cleanRuns.has(runKey(then))) {
      totals["not-captured"]++
      continue
    }
    signal?.throwIfAborted()
    totals.removed++
    changes.push({ ...where(then), status: "removed", before: await copyBefore(then) })
  }
  return {
    status: "compared",
    base: { ...base.source, runId: base.report.runId },
    totals,
    changes,
  }
}

const where = (item: Captured) => ({
  flow: item.flow,
  device: item.device,
  index: item.index,
  checkpoint: item.checkpoint,
  variant: item.variant.id,
})

const runKey = (run: { readonly flow: string; readonly device: DeviceId }): string =>
  `${run.flow}/${run.device}`

/** Every variant a report captured a frame for, keyed so both runs line up. */
function captured(report: FlowReport): Map<string, Captured> {
  const out = new Map<string, Captured>()
  for (const run of report.runs) {
    for (const checkpoint of run.checkpoints) {
      for (const variant of checkpoint.variants) {
        const frame = variant.frame
        if (frame === undefined) continue
        const key = `${runKey(run)}/${checkpoint.name}/${variant.id}`
        out.set(key, {
          key,
          flow: run.flow,
          device: run.device,
          index: checkpoint.index,
          checkpoint: checkpoint.name,
          variant: { ...variant, frame },
        })
      }
    }
  }
  return out
}
