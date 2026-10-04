import { isRecord } from "@plainworks/std"
import { stringifyJson } from "@plainworks/std/encoding"
import type { Clock } from "@plainworks/std/time"
import type { WebAbortSignal } from "@plainworks/std/web"
import { type AuthErrorCode, isAuthErrorKind } from "../errors"

/** A clock the cases move explicitly, so expiry is deterministic for every implementation. */
export interface SteppedClock extends Clock {
  set(now: number): void
}

export function steppedClock(start = 0): SteppedClock {
  let current = start
  return {
    now: () => current,
    set(now) {
      current = now
    },
  }
}

export function abortedSignal(): WebAbortSignal {
  const controller = new AbortController()
  controller.abort()
  return controller.signal
}

export class ConformanceFailure extends Error {
  override readonly name = "ConformanceFailure"
}

function render(value: unknown): string {
  try {
    return value === undefined ? "undefined" : stringifyJson(value)
  } catch {
    return String(value)
  }
}

function same(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) return true
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return actual.length === expected.length && actual.every((item, i) => same(item, expected[i]))
  }
  if (isRecord(actual) && isRecord(expected)) {
    const keys = Object.keys(expected)
    return (
      keys.length === Object.keys(actual).length && keys.every((k) => same(actual[k], expected[k]))
    )
  }
  return false
}

export function equal(actual: unknown, expected: unknown, what: string): void {
  if (!same(actual, expected)) {
    throw new ConformanceFailure(`${what}: expected ${render(expected)}, got ${render(actual)}`)
  }
}

/** Accepts sync or async implementations: a synchronous throw counts as a rejection. */
export async function rejects(
  operation: () => unknown,
  kind: AuthErrorCode | undefined,
  what: string,
): Promise<void> {
  try {
    await operation()
  } catch (cause) {
    if (kind === undefined || isAuthErrorKind(cause, kind)) return
    throw new ConformanceFailure(`${what}: expected ${kind}, got ${String(cause)}`, { cause })
  }
  throw new ConformanceFailure(`${what}: expected rejection`)
}
