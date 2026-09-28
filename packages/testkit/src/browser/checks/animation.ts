import type { Page } from "@playwright/test"

// Longer than any UI transition in the kit, short enough that a stuck animation cannot stall a run.
const ANIMATION_SETTLE_TIMEOUT_MS = 2_000

/**
 * Wait for every running finite animation and transition to finish, so a measurement sees the end
 * state rather than a frame in between. Infinite ones (spinners) are skipped, and the wait is
 * bounded because a paused or replaced animation may never finish.
 */
export async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(
    (timeoutMs) =>
      Promise.race([
        Promise.all(
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation.playState === "running" &&
                animation.effect?.getComputedTiming().endTime !== Infinity,
            )
            .map((animation) => animation.finished.catch(() => undefined)),
        ),
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
      ]),
    ANIMATION_SETTLE_TIMEOUT_MS,
  )
}
