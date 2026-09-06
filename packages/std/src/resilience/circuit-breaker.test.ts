import { expect, test } from "vitest"
import type { Clock } from "../time"
import { CircuitOpenError, createCircuitBreaker } from "./circuit-breaker"
import { NetworkError } from "./classify"

/** A dependency-health failure: the kind the default policy counts toward tripping. */
const down = () => new NetworkError("down")

/** A hand-advanced clock so cooldown transitions are deterministic and instant. */
function manualClock(startMs = 0): Clock & { advance(ms: number): void } {
  let now = startMs
  return { now: () => now, advance: (ms) => (now += ms) }
}

test("opens after the failure threshold and then fails fast", async () => {
  const breaker = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 1_000 })
  const fail = () => breaker.execute(async () => Promise.reject(down()))
  await expect(fail()).rejects.toThrow("down")
  await expect(fail()).rejects.toThrow("down")
  expect(breaker.state).toBe("open")
  await expect(breaker.execute(async () => "unreached")).rejects.toBeInstanceOf(CircuitOpenError)
})

test("moves to half-open after the cooldown and closes on a successful probe", async () => {
  const clock = manualClock(0)
  const breaker = createCircuitBreaker({ failureThreshold: 1, cooldownMs: 1_000, clock })
  await expect(breaker.execute(async () => Promise.reject(down()))).rejects.toThrow()
  expect(breaker.state).toBe("open")

  clock.advance(1_000)
  expect(breaker.state).toBe("half-open")
  await expect(breaker.execute(async () => "ok")).resolves.toBe("ok")
  expect(breaker.state).toBe("closed")
})

test("a failing half-open probe re-opens the breaker", async () => {
  const clock = manualClock(0)
  const breaker = createCircuitBreaker({ failureThreshold: 1, cooldownMs: 500, clock })
  await expect(breaker.execute(async () => Promise.reject(down()))).rejects.toThrow()
  clock.advance(500)
  expect(breaker.state).toBe("half-open")
  await expect(
    breaker.execute(async () => Promise.reject(new NetworkError("still down"))),
  ).rejects.toThrow()
  expect(breaker.state).toBe("open")
})

test("a success in the closed state resets the failure count", async () => {
  const breaker = createCircuitBreaker({ failureThreshold: 2, cooldownMs: 1_000 })
  await expect(breaker.execute(async () => Promise.reject(new NetworkError("x")))).rejects.toThrow()
  await expect(breaker.execute(async () => "ok")).resolves.toBe("ok")
  await expect(breaker.execute(async () => Promise.reject(new NetworkError("x")))).rejects.toThrow()
  expect(breaker.state).toBe("closed")
})

test("half-open admits only one concurrent probe; others fail fast", async () => {
  const clock = manualClock(0)
  const breaker = createCircuitBreaker({ failureThreshold: 1, cooldownMs: 1_000, clock })
  await expect(breaker.execute(async () => Promise.reject(down()))).rejects.toThrow()
  clock.advance(1_000)
  expect(breaker.state).toBe("half-open")

  let releaseProbe: (() => void) | undefined
  const probe = breaker.execute(
    () =>
      new Promise<string>((resolve) => {
        releaseProbe = () => resolve("ok")
      }),
  )
  // A second call while the probe is in flight must not reach the recovering dependency.
  await expect(breaker.execute(async () => "second")).rejects.toBeInstanceOf(CircuitOpenError)

  releaseProbe?.()
  await expect(probe).resolves.toBe("ok")
  expect(breaker.state).toBe("closed")
})

test("rejects invalid options", () => {
  expect(() => createCircuitBreaker({ failureThreshold: 0, cooldownMs: 1 })).toThrow(RangeError)
})

test("fatal caller faults do not count toward tripping", async () => {
  const breaker = createCircuitBreaker({ failureThreshold: 1, cooldownMs: 1_000 })
  await expect(
    breaker.execute(async () => Promise.reject(new Error("caller bug"))),
  ).rejects.toThrow("caller bug")
  expect(breaker.state).toBe("closed")
  await expect(breaker.execute(async () => "still serving")).resolves.toBe("still serving")
})

test("a custom shouldTrip predicate decides which failures count", async () => {
  const breaker = createCircuitBreaker({
    failureThreshold: 1,
    cooldownMs: 1_000,
    shouldTrip: (error) => error instanceof RangeError,
  })
  await expect(breaker.execute(async () => Promise.reject(down()))).rejects.toThrow("down")
  expect(breaker.state).toBe("closed")
  await expect(
    breaker.execute(async () => Promise.reject(new RangeError("bad input"))),
  ).rejects.toThrow("bad input")
  expect(breaker.state).toBe("open")
})

test("rejects fractional thresholds and a non-finite cooldown", () => {
  expect(() => createCircuitBreaker({ failureThreshold: 1.5, cooldownMs: 1 })).toThrow(RangeError)
  expect(() => createCircuitBreaker({ failureThreshold: 1, cooldownMs: Number.NaN })).toThrow(
    RangeError,
  )
  expect(() =>
    createCircuitBreaker({ failureThreshold: 1, cooldownMs: 1, successThreshold: 0.5 }),
  ).toThrow(RangeError)
})

test("a non-tripping fault between probes breaks the consecutive-success streak", async () => {
  const clock = manualClock(0)
  const breaker = createCircuitBreaker({
    failureThreshold: 1,
    cooldownMs: 1_000,
    successThreshold: 2,
    clock,
  })
  await expect(breaker.execute(async () => Promise.reject(down()))).rejects.toThrow()
  clock.advance(1_000)
  expect(breaker.state).toBe("half-open")

  // A first probe succeeds, then a fatal caller fault (non-counted) must reset the streak, so a
  // single later success is not enough to close a breaker requiring two consecutive probes.
  await expect(breaker.execute(async () => "ok")).resolves.toBe("ok")
  await expect(
    breaker.execute(async () => Promise.reject(new Error("caller bug"))),
  ).rejects.toThrow("caller bug")
  expect(breaker.state).toBe("half-open")
  await expect(breaker.execute(async () => "ok")).resolves.toBe("ok")
  expect(breaker.state).toBe("half-open")
  await expect(breaker.execute(async () => "ok")).resolves.toBe("ok")
  expect(breaker.state).toBe("closed")
})

test("a stale closed-state success does not count toward the half-open probe", async () => {
  const clock = manualClock(0)
  const breaker = createCircuitBreaker({ failureThreshold: 1, cooldownMs: 1_000, clock })

  let releaseSlow: (() => void) | undefined
  const slow = breaker.execute(
    () =>
      new Promise<string>((resolve) => {
        releaseSlow = () => resolve("slow")
      }),
  )
  await expect(breaker.execute(async () => Promise.reject(down()))).rejects.toThrow()
  expect(breaker.state).toBe("open")

  clock.advance(1_000)
  let releaseProbe: (() => void) | undefined
  const probe = breaker.execute(
    () =>
      new Promise<string>((resolve) => {
        releaseProbe = () => resolve("probe")
      }),
  )
  expect(breaker.state).toBe("half-open")

  // The slow call was admitted while closed; its late success must not close the breaker.
  releaseSlow?.()
  await expect(slow).resolves.toBe("slow")
  expect(breaker.state).toBe("half-open")

  releaseProbe?.()
  await expect(probe).resolves.toBe("probe")
  expect(breaker.state).toBe("closed")
})

test("a stale closed-state failure does not re-open the breaker during a probe", async () => {
  const clock = manualClock(0)
  const breaker = createCircuitBreaker({ failureThreshold: 1, cooldownMs: 1_000, clock })

  let failSlow: ((error: Error) => void) | undefined
  const slow = breaker.execute(
    () =>
      new Promise<string>((_resolve, reject) => {
        failSlow = reject
      }),
  )
  await expect(breaker.execute(async () => Promise.reject(down()))).rejects.toThrow()
  clock.advance(1_000)

  let releaseProbe: (() => void) | undefined
  const probe = breaker.execute(
    () =>
      new Promise<string>((resolve) => {
        releaseProbe = () => resolve("probe")
      }),
  )
  failSlow?.(new NetworkError("late failure"))
  await expect(slow).rejects.toThrow("late failure")
  expect(breaker.state).toBe("half-open")

  releaseProbe?.()
  await expect(probe).resolves.toBe("probe")
  expect(breaker.state).toBe("closed")
})
