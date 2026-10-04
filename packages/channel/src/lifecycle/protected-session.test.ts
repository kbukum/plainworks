import { RemoteFailure } from "@plainworks/std/failure"
import type { ProtectedSession, StreamTransport } from "@plainworks/std/seam"
import type { WebAbortSignal } from "@plainworks/std/web"
import { flushMicrotasks, manualDelay } from "@plainworks/testkit"
import { fakeStreamTransport } from "@plainworks/testkit/fakes"
import { expect, test, vi } from "vitest"
import { createChannel } from "./channel"

test("a late auth failure from a closed attempt does not invalidate a newer session", async () => {
  const delay = manualDelay()
  const lifetime = new AbortController()
  const invalidate = vi.fn()
  const authFailure = new RemoteFailure("rpc/unauthorized", {
    code: "UNAUTHORIZED",
    reason: "SESSION_INVALID",
    message: "signed out",
    retryable: false,
    violations: [],
  })
  // A transport whose aborted attempt surfaces the server's auth rejection rather than a plain
  // AbortError — the real race where a closing stream still carries a 401.
  const transport: StreamTransport = {
    open: (context) =>
      new Promise<void>((_resolve, reject) => {
        context.signal.addEventListener("abort", () => reject(authFailure), { once: true })
      }),
  }
  const session: ProtectedSession = {
    acquire: async () => ({ signal: lifetime.signal, headers: {}, release: () => {} }),
    revalidate: async () => {},
    invalidate,
  }
  const channel = createChannel({
    transport: () => transport,
    protectedSession: session,
    delay: delay.delay,
    backoff: { baseMs: 10, maxMs: 10, factor: 1, jitter: "none" },
  })
  channel.connect()
  await flushMicrotasks()
  // The caller closes; the already-settled attempt then rejects late with the auth failure.
  channel.close()
  await flushMicrotasks()
  expect(invalidate).not.toHaveBeenCalled()
})

test("protected reconnect validates status once and cannot blindly reopen after failure", async () => {
  const transport = fakeStreamTransport()
  const delay = manualDelay()
  const lifetime = new AbortController()
  const release = vi.fn()
  const revalidate = vi.fn(async () => {
    throw new Error("status unavailable")
  })
  const session: ProtectedSession = {
    acquire: async () => ({ signal: lifetime.signal, headers: {}, release }),
    revalidate,
    invalidate: (cause) => lifetime.abort(cause),
  }
  const channel = createChannel({
    transport: transport.factory,
    protectedSession: session,
    delay: delay.delay,
    backoff: { baseMs: 10, maxMs: 10, factor: 1, jitter: "none" },
  })
  channel.connect()
  await flushMicrotasks()
  transport.current?.context.onRetry?.(30_000)
  transport.current?.endOk()
  await flushMicrotasks()
  expect(revalidate).toHaveBeenCalledOnce()
  expect(transport.attempts).toHaveLength(1)
  expect(channel.status).toBe("closed")
  expect(release).toHaveBeenCalledOnce()
  expect(delay.pending).toHaveLength(0)
})

test("a held reconnect status is cancelled within one second", async () => {
  const transport = fakeStreamTransport()
  const delay = manualDelay()
  let statusSignal: WebAbortSignal | undefined
  const channel = createChannel({
    transport: transport.factory,
    delay: delay.delay,
    protectedSession: {
      acquire: async () => ({
        signal: new AbortController().signal,
        headers: {},
        release: () => {},
      }),
      revalidate: ({ signal } = {}) => {
        statusSignal = signal
        return new Promise(() => {})
      },
      invalidate: () => {},
    },
  })
  channel.connect()
  await flushMicrotasks()
  transport.current?.endOk()
  await flushMicrotasks()
  expect(statusSignal).toBeDefined()
  delay.fireWhere((ms) => ms === 1_000)
  await flushMicrotasks()
  expect(statusSignal?.aborted).toBe(true)
  expect(channel.status).toBe("closed")
  expect(transport.attempts).toHaveLength(1)
  expect(delay.pending).toHaveLength(0)
})

test("100 protected stream teardown cycles leave no transport, timers or borrowed leases", async () => {
  const delay = manualDelay()
  const release = vi.fn()
  for (let i = 0; i < 100; i++) {
    const lifetime = new AbortController()
    const transport = fakeStreamTransport()
    const channel = createChannel({
      transport: transport.factory,
      delay: delay.delay,
      protectedSession: {
        acquire: async () => ({ signal: lifetime.signal, headers: {}, release }),
        revalidate: async () => {},
        invalidate: (cause) => lifetime.abort(cause),
      },
    })
    channel.connect()
    await flushMicrotasks()
    lifetime.abort()
    await flushMicrotasks()
    expect(channel.status).toBe("closed")
    expect(transport.current?.aborted).toBe(true)
    channel.close()
    expect(delay.pending).toHaveLength(0)
  }
  expect(release).toHaveBeenCalledTimes(100)
})
