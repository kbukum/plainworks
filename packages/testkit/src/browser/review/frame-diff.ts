import pixelmatch from "pixelmatch"
import { PNG } from "pngjs"
import { FlowError } from "../flow/errors"

/** Options for {@link diffFrames}. */
export interface FrameDiffOptions {
  /**
   * How far apart two pixels' colors may be and still match, from 0 to 1. Defaults to `0.1`, which
   * absorbs rendering noise but not a changed color.
   */
  readonly threshold?: number
  /**
   * How many pixels may differ with the frame still `unchanged`. Defaults to 8: a stray speck
   * stays quiet, while even the smallest 24×24 control that moves differs by far more.
   */
  readonly tolerancePixels?: number
}

/** How two frames compare. */
export interface FrameDiff {
  /** More pixels differ than the tolerance allows, or the frame size changed. */
  readonly changed: boolean
  readonly sizeChanged: boolean
  /** Pixels that differ, not counting anti-aliasing. */
  readonly different: number
  /** Pixels compared: the larger width × the larger height. */
  readonly total: number
  /** For a changed frame, a PNG with the differing pixels in red over a faded frame. */
  readonly image?: Uint8Array
}

const DEFAULT_THRESHOLD = 0.1
const DEFAULT_TOLERANCE_PIXELS = 8

/**
 * Compare two PNG frames pixel by pixel. Both come from the same machine, so fonts and rendering
 * match and any difference beyond noise is the change under review. Anti-aliased edges are not
 * counted. Frames of different sizes are compared over the larger canvas, with the missing area
 * transparent. Throws a `flow/report` {@link FlowError} for bytes that are not a PNG.
 */
export function diffFrames(
  before: Uint8Array,
  after: Uint8Array,
  options: FrameDiffOptions = {},
): FrameDiff {
  const a = decode(before, "base")
  const b = decode(after, "current")
  const width = Math.max(a.width, b.width)
  const height = Math.max(a.height, b.height)
  const sizeChanged = a.width !== b.width || a.height !== b.height
  const output = new PNG({ width, height })
  const different = pixelmatch(
    onCanvas(a, width, height),
    onCanvas(b, width, height),
    output.data,
    width,
    height,
    { threshold: options.threshold ?? DEFAULT_THRESHOLD },
  )
  const changed = sizeChanged || different > (options.tolerancePixels ?? DEFAULT_TOLERANCE_PIXELS)
  return {
    changed,
    sizeChanged,
    different,
    total: width * height,
    ...(changed ? { image: new Uint8Array(PNG.sync.write(output)) } : {}),
  }
}

function decode(bytes: Uint8Array, which: string): PNG {
  try {
    return PNG.sync.read(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
  } catch (cause) {
    throw new FlowError("report", `The ${which} frame is not a readable PNG`, { cause })
  }
}

/** The image's RGBA pixels on a `width × height` canvas, transparent where the image is not. */
function onCanvas(image: PNG, width: number, height: number): Uint8Array {
  if (image.width === width && image.height === height) return image.data
  const canvas = new Uint8Array(width * height * 4)
  for (let y = 0; y < image.height; y++) {
    const row = image.data.subarray(y * image.width * 4, (y + 1) * image.width * 4)
    canvas.set(row, y * width * 4)
  }
  return canvas
}
