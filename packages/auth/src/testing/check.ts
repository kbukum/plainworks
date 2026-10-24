import { isStructurallyEqual } from "@plainworks/std"
import { stringifyJson } from "@plainworks/std/encoding"
import type { WebAbortSignal } from "@plainworks/std/web"
import { type AuthErrorCode, isAuthErrorKind } from "../errors"

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

export function equal(actual: unknown, expected: unknown, what: string): void {
  if (!isStructurallyEqual(actual, expected)) {
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
