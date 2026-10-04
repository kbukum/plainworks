import type { Page } from "@playwright/test"
import { FlowError } from "../flow/errors"

// Longer than any UI transition in the kit, short enough that a stuck animation cannot stall a run.
const ANIMATION_SETTLE_TIMEOUT_MS = 2_000

/**
 * Wait for every running finite animation and transition to finish, so a measurement sees the end
 * state rather than a frame in between. Recheck after rendering so chained animations are included.
 * Infinite ones (spinners) are skipped; finite motion that exceeds the budget fails readiness.
 */
export async function settleAnimations(page: Page): Promise<void> {
  const settled = await page.evaluate(async (timeoutMs) => {
    let stopped = false
    let frame: number | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs)
    })
    const wait = async (): Promise<boolean> => {
      let idleFrames = 0
      while (!stopped) {
        await new Promise<void>((resolve) => {
          frame = requestAnimationFrame(() => resolve())
        })
        if (stopped) return false
        const animations = document
          .getAnimations()
          .filter(
            (animation) =>
              animation.playState === "running" &&
              animation.effect?.getComputedTiming().endTime !== Infinity,
          )
        if (animations.length === 0) {
          if (++idleFrames === 2) return true
        } else {
          idleFrames = 0
          await Promise.all(
            animations.map((animation) => animation.finished.catch(() => undefined)),
          )
        }
      }
      return false
    }
    try {
      return await Promise.race([wait(), deadline])
    } finally {
      stopped = true
      if (frame !== undefined) cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, ANIMATION_SETTLE_TIMEOUT_MS)
  if (!settled) throw new FlowError("timeout", "Finite animations did not settle within 2000 ms.")
}
