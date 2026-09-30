import { posix } from "node:path"
import type { Flow } from "../flow/definition"
import type { FlowMode } from "../flow/matrix/axes"
import type { DeviceId } from "../flow/matrix/devices"
import type { ArtifactStore } from "../flow/report/artifacts"
import type { FlowReport } from "../flow/report/schema"
import { UiCaptureError } from "./errors"

/** A checkpoint a flow marks as a docs image. */
export interface DocsImage {
  readonly name: string
  readonly flow: string
  readonly checkpoint: string
}

/** What {@link publishDocsImages} changed in the docs folder, as file names. */
export interface PublishedDocsImages {
  readonly written: readonly string[]
  readonly removed: readonly string[]
}

const DOCS_DEVICE: DeviceId = "desktop"
const DOCS_MODES: readonly FlowMode[] = ["light", "dark"]

/**
 * The docs images a suite marks, in flow order. Throws a `usage` {@link UiCaptureError} when two
 * checkpoints share a name, so neither silently overwrites the other.
 */
export function docsImagesOf(flows: readonly Flow[]): DocsImage[] {
  const images: DocsImage[] = []
  const owners = new Map<string, string>()
  for (const flow of flows) {
    for (const checkpoint of flow.checkpoints) {
      if (checkpoint.docs === undefined) continue
      const at = `"${flow.name}" › "${checkpoint.name}"`
      const owner = owners.get(checkpoint.docs)
      if (owner !== undefined) {
        throw new UiCaptureError(
          "usage",
          `"${checkpoint.docs}" names a docs image in both ${owner} and ${at}; rename one`,
        )
      }
      owners.set(checkpoint.docs, at)
      images.push({ name: checkpoint.docs, flow: flow.name, checkpoint: checkpoint.name })
    }
  }
  return images
}

/**
 * Copy each docs image's desktop frame, light and dark, from a run into `dir` as
 * `<name>-light.png` and `<name>-dark.png`, then remove every other PNG there, so the folder holds
 * exactly the marked set. Every frame is read before anything is written, so a missing frame
 * throws a `harness` {@link UiCaptureError} and leaves the folder as it was. Files other than PNGs
 * are left alone.
 */
export async function publishDocsImages(options: {
  readonly images: readonly DocsImage[]
  readonly report: FlowReport
  /** The run directory the report's frame paths are relative to. */
  readonly runDir: string
  readonly dir: string
  readonly store: ArtifactStore
  readonly signal?: AbortSignal
}): Promise<PublishedDocsImages> {
  const { images, report, runDir, dir, store, signal } = options
  const pending: { readonly file: string; readonly data: Uint8Array }[] = []
  for (const image of images) {
    const checkpoint = report.runs
      .find((run) => run.flow === image.flow && run.device === DOCS_DEVICE)
      ?.checkpoints.find((entry) => entry.name === image.checkpoint)
    for (const mode of DOCS_MODES) {
      const frame = checkpoint?.variants.find(
        (variant) => variant.mode === mode && variant.preference === "standard",
      )?.frame
      if (frame === undefined) {
        throw new UiCaptureError(
          "harness",
          `The run has no ${DOCS_DEVICE} ${mode} frame for docs image "${image.name}" (${image.flow} › ${image.checkpoint})`,
        )
      }
      pending.push({
        file: `${image.name}-${mode}.png`,
        data: await store.readBytes(posix.join(runDir, frame)),
      })
    }
  }

  const keep = new Set(pending.map((entry) => entry.file))
  const removed = (await store.list(dir)).filter((file) => file.endsWith(".png") && !keep.has(file))
  for (const entry of pending) await store.write(posix.join(dir, entry.file), entry.data, signal)
  for (const file of removed) await store.remove(posix.join(dir, file))
  return { written: [...keep].sort(), removed }
}
