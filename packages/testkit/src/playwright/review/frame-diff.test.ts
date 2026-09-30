import { PNG } from "pngjs"
import { describe, expect, it } from "vitest"
import { FlowError } from "../flow/errors"
import { diffFrames } from "./frame-diff"

type Paint = (x: number, y: number) => readonly [number, number, number]

/** A PNG of `width × height` whose pixels `paint` colors. */
function png(width: number, height: number, paint: Paint): Uint8Array {
  const image = new PNG({ width, height })
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y)
      const at = (y * width + x) * 4
      image.data[at] = r
      image.data[at + 1] = g
      image.data[at + 2] = b
      image.data[at + 3] = 255
    }
  }
  return new Uint8Array(PNG.sync.write(image))
}

const WHITE = [255, 255, 255] as const
/** A page with one 24×24 dark control at `left`. */
const page = (left: number, tint = 0): Uint8Array =>
  png(120, 60, (x, y) =>
    x >= left && x < left + 24 && y >= 18 && y < 42
      ? [30, 30, 30]
      : [WHITE[0] - tint, WHITE[1] - tint, WHITE[2] - tint],
  )

describe("diffFrames", () => {
  it("finds identical frames unchanged, with no diff image", () => {
    const result = diffFrames(page(10), page(10))
    expect(result).toMatchObject({ changed: false, different: 0, sizeChanged: false, total: 7200 })
    expect(result.image).toBeUndefined()
  })

  it("keeps rendering noise below the threshold unchanged", () => {
    expect(diffFrames(page(10), page(10, 2)).changed).toBe(false)
  })

  it("keeps a handful of stray pixels within the tolerance unchanged", () => {
    const speck = png(120, 60, (x, y) => (x === 100 && y === 5 ? [0, 0, 0] : WHITE))
    const clean = png(120, 60, () => WHITE)
    expect(diffFrames(clean, speck)).toMatchObject({ changed: false, different: 1 })
    expect(diffFrames(clean, speck, { tolerancePixels: 0 }).changed).toBe(true)
  })

  it("finds a moved control changed, with the changed pixels highlighted", () => {
    const result = diffFrames(page(10), page(60))
    expect(result.changed).toBe(true)
    expect(result.different).toBeGreaterThan(24 * 24)
    const image = PNG.sync.read(Buffer.from(result.image ?? new Uint8Array()))
    expect([image.width, image.height]).toEqual([120, 60])
  })

  it("finds a frame whose size changed changed, comparing over the larger canvas", () => {
    const result = diffFrames(
      png(120, 60, () => WHITE),
      png(120, 80, () => WHITE),
    )
    expect(result).toMatchObject({ changed: true, sizeChanged: true, total: 9600 })
    const image = PNG.sync.read(Buffer.from(result.image ?? new Uint8Array()))
    expect([image.width, image.height]).toEqual([120, 80])
  })

  it("rejects bytes that are not a PNG as a report error", () => {
    expect(() => diffFrames(Uint8Array.of(1, 2, 3), page(10))).toThrow(FlowError)
  })
})
