import { create } from "@bufbuild/protobuf"
import type { Interceptor } from "@connectrpc/connect"
import type { ProtectedSession } from "@plainworks/std/seam"
import { deferred, flushMicrotasks } from "@plainworks/testkit"
import {
  EchoService,
  fakeStreamRequest,
  fakeUnaryRequest,
  fakeUnaryResponse,
} from "@plainworks/testkit/connect"
import { expect, test, vi } from "vitest"
import { injectedAuthHeadersKey } from "./auth-header"
import { protectedSessionInterceptor } from "./protected-session"

type Next = Parameters<Interceptor>[0]
const echo = EchoService.method.echo

test("session proof tracking preserves previously injected credential names", async () => {
  const request = fakeUnaryRequest(echo)
  request.contextValues.set(injectedAuthHeadersKey, ["X-Existing-Proof"])
  const session: ProtectedSession = {
    acquire: async () => ({
      signal: new AbortController().signal,
      headers: { "X-Session-Proof": "proof" },
      release() {},
    }),
    revalidate: async () => {},
    invalidate() {},
  }
  await protectedSessionInterceptor(session)(async (next) => {
    expect(next.contextValues.get(injectedAuthHeadersKey)).toEqual([
      "X-Existing-Proof",
      "X-Session-Proof",
    ])
    return fakeUnaryResponse(echo, { message: "ok" })
  })(request)
})

test("100 protected RPC calls cancel uncooperative work and release their lifetime", async () => {
  const release = vi.fn()
  for (let i = 0; i < 100; i++) {
    const lifetime = new AbortController()
    const session: ProtectedSession = {
      acquire: async () => ({
        signal: lifetime.signal,
        headers: { "X-CSRF-Token": "csrf" },
        release,
      }),
      revalidate: async () => {},
      invalidate: (cause) => lifetime.abort(cause),
    }
    const held = deferred<Awaited<ReturnType<Next>>>()
    const next: Next = (request) => {
      expect(request.header.get("X-CSRF-Token")).toBe("csrf")
      return held.promise
    }
    const result = protectedSessionInterceptor(session)(next)(fakeUnaryRequest(echo))
    await flushMicrotasks()
    lifetime.abort()
    await expect(result).rejects.toMatchObject({ kind: "std/aborted" })
    held.resolve(fakeUnaryResponse(echo, { message: "late" }))
  }
  expect(release).toHaveBeenCalledTimes(100)
})

test("100 abandoned or blocked RPC streams release exactly once without waiting for source cleanup", async () => {
  const count = EchoService.method.count
  const value = create(count.output)
  const release = vi.fn()
  for (let i = 0; i < 100; i++) {
    const lifetime = new AbortController()
    const held = deferred<IteratorResult<typeof value>>()
    const cleanup = deferred<IteratorResult<typeof value>>()
    const close = vi.fn(() => cleanup.promise)
    const source: AsyncIterable<typeof value> = {
      [Symbol.asyncIterator]: () => ({ next: () => held.promise, return: close }),
    }
    const session: ProtectedSession = {
      acquire: async () => ({ signal: lifetime.signal, headers: {}, release }),
      revalidate: async () => {},
      invalidate: (cause) => lifetime.abort(cause),
    }
    const next: Next = async () => ({
      stream: true,
      service: count.parent,
      method: count,
      header: new Headers(),
      trailer: new Headers(),
      message: source,
    })
    const response = await protectedSessionInterceptor(session)(next)(fakeStreamRequest(count))
    if (!response.stream) throw new Error("stream expected")
    const iterator = response.message[Symbol.asyncIterator]()
    const pending = i % 2 === 0 ? iterator.next() : undefined
    lifetime.abort()
    if (pending !== undefined) await expect(pending).rejects.toMatchObject({ kind: "std/aborted" })
    await flushMicrotasks()
    expect(close).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledTimes(i + 1)
    held.resolve({ done: true, value: undefined })
    cleanup.resolve({ done: true, value: undefined })
  }
})

test("successful unary, completed streams and early consumer return release their leases", async () => {
  const release = vi.fn()
  const session: ProtectedSession = {
    acquire: async () => ({ signal: new AbortController().signal, headers: {}, release }),
    revalidate: async () => {},
    invalidate: () => {},
  }
  const unary = await protectedSessionInterceptor(session)(async () =>
    fakeUnaryResponse(echo, { message: "ok" }),
  )(fakeUnaryRequest(echo))
  expect(unary.stream).toBe(false)
  const count = EchoService.method.count
  const value = create(count.output)
  for (const early of [false, true]) {
    async function* source() {
      yield value
      yield value
    }
    const response = await protectedSessionInterceptor(session)(async () => ({
      stream: true,
      service: count.parent,
      method: count,
      header: new Headers(),
      trailer: new Headers(),
      message: source(),
    }))(fakeStreamRequest(count))
    if (!response.stream) throw new Error("stream expected")
    const values = []
    for await (const message of response.message) {
      values.push(message)
      if (early) break
    }
    expect(values).toHaveLength(early ? 1 : 2)
  }
  expect(release).toHaveBeenCalledTimes(3)
})
