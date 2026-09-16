/**
 * Simulated network latency. Latency is per mock server (never a module global): each
 * `createMockApi` builds its own controller, so parallel servers cannot leak timing into each
 * other and tests stay deterministic — latency is disabled (0 ms) unless explicitly set.
 */

/** Per-server latency control: a fixed delay applied before every handler responds. */
export interface LatencyController {
  /** Current latency in ms (0 = disabled). */
  get(): number
  /** Set the latency in ms; values clamp to `>= 0`. Pass 0 to disable. */
  set(ms: number): void
  /**
   * Wait for the configured latency; resolves immediately when disabled or when `signal` aborts
   * (the pending timer is cleared, so aborted requests never leave timers running).
   */
  wait(signal?: AbortSignal): Promise<void>
}

const sanitize = (ms: number): number => {
  if (!Number.isFinite(ms)) {
    throw new RangeError("latency must be a finite number")
  }
  return Math.max(0, ms)
}

/** Build a {@link LatencyController}; `initialMs` must be finite (0 = disabled). */
export function createLatency(initialMs = 0): LatencyController {
  let fixedMs = sanitize(initialMs)

  return {
    get: () => fixedMs,

    set(ms: number): void {
      fixedMs = sanitize(ms)
    },

    wait(signal?: AbortSignal): Promise<void> {
      if (fixedMs <= 0 || signal?.aborted) return Promise.resolve()
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          signal?.removeEventListener("abort", onAbort)
          resolve()
        }, fixedMs)
        const onAbort = (): void => {
          clearTimeout(timer)
          resolve()
        }
        signal?.addEventListener("abort", onAbort, { once: true })
      })
    },
  }
}
