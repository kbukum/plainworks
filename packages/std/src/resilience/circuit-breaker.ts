import { PlainError } from "../errors"
import type { Clock } from "../time"
import { systemClock } from "../time"
import { isRetryable } from "./classify"

/** Observable breaker state: `closed` passes calls, `open` fails fast, `half-open` probes recovery. */
export type CircuitState = "closed" | "open" | "half-open"

/** Configuration for {@link createCircuitBreaker}. Clock-injected so transitions are deterministic. */
export interface CircuitBreakerOptions {
  /** Consecutive failures in `closed` that trip the breaker to `open`. */
  readonly failureThreshold: number
  /** How long the breaker stays `open` before allowing a `half-open` probe, in milliseconds. */
  readonly cooldownMs: number
  /** Consecutive `half-open` successes required to close again. Defaults to `1`. */
  readonly successThreshold?: number
  /** Decide whether a failure counts toward tripping. Defaults to the shared classifier: only retryable (dependency-health) failures count — fatal caller faults (auth, protocol, aborts, programmer errors) never trip the breaker. */
  readonly shouldTrip?: (error: unknown) => boolean
  /** Time source; defaults to the system clock. */
  readonly clock?: Clock
}

/** A per-instance circuit breaker. Build one per protected dependency; never a module singleton. */
export interface CircuitBreaker {
  /** Current state, accounting for an elapsed cooldown (`open` → `half-open`). */
  readonly state: CircuitState
  /** Run `operation` unless the breaker is `open`, updating state from the outcome. */
  execute<T>(operation: () => Promise<T>): Promise<T>
}

/** Raised by {@link CircuitBreaker.execute} when the breaker is `open` and rejecting calls. */
export class CircuitOpenError extends PlainError<"std/circuit-open"> {
  constructor() {
    super("std/circuit-open", "Circuit breaker is open")
  }
}

/**
 * Build a {@link CircuitBreaker}. It trips to `open` after `failureThreshold` consecutive counted
 * failures, fails fast for `cooldownMs`, then admits a single `half-open` probe; `successThreshold`
 * consecutive probe successes close it again, while any counted probe failure re-opens it.
 * Degrades gracefully instead of hammering a dead dependency.
 */
export function createCircuitBreaker(options: CircuitBreakerOptions): CircuitBreaker {
  const clock = options.clock ?? systemClock
  const successThreshold = options.successThreshold ?? 1
  const shouldTrip = options.shouldTrip ?? isRetryable
  if (
    !Number.isInteger(options.failureThreshold) ||
    options.failureThreshold < 1 ||
    !Number.isInteger(successThreshold) ||
    successThreshold < 1 ||
    !Number.isFinite(options.cooldownMs) ||
    options.cooldownMs < 0
  ) {
    throw new RangeError(
      "CircuitBreaker requires integer failureThreshold >= 1, integer successThreshold >= 1, and finite cooldownMs >= 0",
    )
  }

  let state: CircuitState = "closed"
  let failures = 0
  let successes = 0
  let openedAt = 0
  let probing = false
  // Bumped on every state transition so an outcome is applied only to the era that admitted it.
  let generation = 0

  const trip = (): void => {
    state = "open"
    openedAt = clock.now()
    successes = 0
    generation++
  }

  const currentState = (): CircuitState => {
    if (state === "open" && clock.now() - openedAt >= options.cooldownMs) {
      state = "half-open"
      successes = 0
      generation++
    }
    return state
  }

  const onSuccess = (): void => {
    if (state === "half-open") {
      successes++
      if (successes >= successThreshold) {
        state = "closed"
        failures = 0
        generation++
      }
      return
    }
    failures = 0
  }

  const onFailure = (): void => {
    if (state === "half-open") {
      trip()
      return
    }
    failures++
    if (failures >= options.failureThreshold) {
      trip()
    }
  }

  return {
    get state() {
      return currentState()
    },
    async execute<T>(operation: () => Promise<T>): Promise<T> {
      const admitted = currentState()
      if (admitted === "open") {
        throw new CircuitOpenError()
      }
      // Half-open admits exactly one trial call; concurrent callers fail fast so a recovering
      // dependency sees a single probe, not a fresh stampede.
      if (admitted === "half-open") {
        if (probing) {
          throw new CircuitOpenError()
        }
        probing = true
      }
      const admittedGeneration = generation
      try {
        const value = await operation()
        // A call admitted under an earlier era (e.g. a slow closed-state call that settles after
        // the breaker opened) must not drive the current state's transitions.
        if (generation === admittedGeneration) {
          onSuccess()
        }
        return value
      } catch (error) {
        if (generation === admittedGeneration) {
          if (shouldTrip(error)) {
            onFailure()
          } else if (admitted === "half-open") {
            // A non-counted fault still breaks the consecutive-probe streak, so `successThreshold`
            // demands genuinely consecutive successes — but it must not re-open a recovering
            // breaker.
            successes = 0
          }
        }
        throw error
      } finally {
        if (admitted === "half-open") {
          probing = false
        }
      }
    },
  }
}
