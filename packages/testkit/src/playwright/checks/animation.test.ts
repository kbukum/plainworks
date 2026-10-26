import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { waitForFiniteAnimations } from "./animation"

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 16),
  )
  vi.stubGlobal("cancelAnimationFrame", clearTimeout)
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const finite = {
  playState: "running",
  effect: { getComputedTiming: () => ({ endTime: 200 }) },
  finished: new Promise<void>(() => {}),
}

it("settles when a removed transition leaves its finished promise pending", async () => {
  const animations = vi.fn().mockReturnValueOnce([finite]).mockReturnValue([])
  vi.stubGlobal("document", { getAnimations: animations })
  let outcome: boolean | undefined
  void waitForFiniteAnimations(2_000).then((settled) => {
    outcome = settled
  })
  await vi.advanceTimersByTimeAsync(64)
  expect(outcome).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

it("still refuses finite motion that exceeds the deadline and clears its resources", async () => {
  vi.stubGlobal("document", { getAnimations: () => [finite] })
  const settled = waitForFiniteAnimations(2_000)
  await vi.advanceTimersByTimeAsync(2_000)
  expect(await settled).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})

it("includes chained motion and skips infinite spinners", async () => {
  const spinner = {
    playState: "running",
    effect: { getComputedTiming: () => ({ endTime: Infinity }) },
  }
  const animations = vi
    .fn()
    .mockReturnValueOnce([])
    .mockReturnValueOnce([finite])
    .mockReturnValue([spinner])
  vi.stubGlobal("document", { getAnimations: animations })
  let outcome: boolean | undefined
  void waitForFiniteAnimations(2_000).then((settled) => {
    outcome = settled
  })
  await vi.advanceTimersByTimeAsync(48)
  expect(outcome).toBeUndefined()
  await vi.advanceTimersByTimeAsync(16)
  expect(outcome).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})
