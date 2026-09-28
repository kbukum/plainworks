import { describe, expect, it } from "vitest"
import { FlowError } from "./errors"
import { captureStableFrame } from "./stable-frame"

const frame = (value: number): Uint8Array => Uint8Array.of(value, value, value)

function shots(...values: number[]) {
  let taken = 0
  return {
    shoot: async (): Promise<Uint8Array> =>
      frame(values[Math.min(taken++, values.length - 1)] ?? 0),
    taken: () => taken,
  }
}

describe("captureStableFrame", () => {
  it("returns the first frame the page paints twice in a row", async () => {
    const camera = shots(1, 2, 3, 3)
    expect(await captureStableFrame(camera.shoot)).toEqual(frame(3))
    expect(camera.taken()).toBe(4)
  })

  it("settles in two shots when the page is already still", async () => {
    const camera = shots(7, 7)
    await captureStableFrame(camera.shoot)
    expect(camera.taken()).toBe(2)
  })

  it("fails with a typed error, never a bad image, when the page never settles", async () => {
    let value = 0
    const error = await captureStableFrame(async () => frame(value++), { maxShots: 5 }).catch(
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(FlowError)
    expect(error).toMatchObject({ kind: "flow/unstable-frame" })
    expect(value).toBe(5)
  })

  it("stops shooting once the caller aborts", async () => {
    const controller = new AbortController()
    let value = 0
    const error = await captureStableFrame(
      async () => {
        if (value === 2) controller.abort()
        return frame(value++)
      },
      { signal: controller.signal },
    ).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ kind: "flow/aborted" })
    expect(value).toBe(3)
  })

  it("cancels a shot in flight, handing it the abort signal", async () => {
    const controller = new AbortController()
    let received: AbortSignal | undefined
    const capture = captureStableFrame(
      (signal) => {
        received = signal
        return new Promise<Uint8Array>(() => controller.abort())
      },
      { signal: controller.signal },
    )
    await expect(capture).rejects.toMatchObject({ kind: "flow/aborted" })
    expect(received?.aborted).toBe(true)
  })

  it("rejects a shot budget that cannot compare two frames", async () => {
    await expect(captureStableFrame(shots(1).shoot, { maxShots: 1 })).rejects.toThrow(RangeError)
  })
})
