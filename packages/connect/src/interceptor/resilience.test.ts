import { Code, ConnectError, type Interceptor } from "@connectrpc/connect"
import type { Delay, WebAbortSignal } from "@plainworks/std"
import { flushMicrotasks, manualDelay, seededRandom } from "@plainworks/testkit"
import {
  countResponse,
  EchoService,
  fakeStreamRequest,
  fakeUnaryRequest,
  fakeUnaryResponse,
} from "@plainworks/testkit/connect"
import { describe, expect, test } from "vitest"
import { type ConnectRetryPolicy, resilienceInterceptor } from "./resilience"

type NextFn = Parameters<Interceptor>[0]

const echo = EchoService.method.echo
const mutate = EchoService.method.mutate
const count = EchoService.method.count
const okResponse = fakeUnaryResponse(echo, { message: "ok" })

const retry: ConnectRetryPolicy = {
  maxAttempts: 3,
  backoff: { baseMs: 10, maxMs: 100, factor: 2, jitter: "none" },
}

describe("resilienceInterceptor", () => {
  test("times a hung attempt out as deadline_exceeded", async () => {
    const manual = manualDelay()
    const next: NextFn = () => new Promise(() => {})
    const intercepted = resilienceInterceptor({ timeoutMs: 1000, delay: manual.delay })(next)

    const promise = intercepted(fakeUnaryRequest(echo)).catch((reason: unknown) => reason)
    await flushMicrotasks()
    expect(manual.fireNext()).toBe(true)

    const error = await promise
    expect(error).toBeInstanceOf(ConnectError)
    expect((error as ConnectError).code).toBe(Code.DeadlineExceeded)
  })

  test("retries an idempotent method after a retryable failure, then succeeds", async () => {
    const manual = manualDelay()
    let attempts = 0
    const next: NextFn = () => {
      attempts++
      return attempts < 2
        ? Promise.reject(new ConnectError("down", Code.Unavailable))
        : Promise.resolve(okResponse)
    }
    const intercepted = resilienceInterceptor({
      timeoutMs: 1000,
      retry,
      delay: manual.delay,
      random: seededRandom(1),
    })(next)

    const promise = intercepted(fakeUnaryRequest(echo))
    await flushMicrotasks()
    // Only the backoff wait needs firing; the per-attempt timeout auto-aborts on a settled attempt.
    expect(manual.fireWhere((ms) => ms === 10)).toBe(1)

    const response = await promise
    expect(attempts).toBe(2)
    expect(response.stream).toBe(false)
  })

  test("never retries a non-idempotent write", async () => {
    const manual = manualDelay()
    let attempts = 0
    const next: NextFn = () => {
      attempts++
      return Promise.reject(new ConnectError("down", Code.Unavailable))
    }
    const intercepted = resilienceInterceptor({ timeoutMs: 1000, retry, delay: manual.delay })(next)

    const error = await intercepted(fakeUnaryRequest(mutate)).catch((reason: unknown) => reason)

    expect(attempts).toBe(1)
    expect((error as ConnectError).code).toBe(Code.Unavailable)
  })

  test("maps a caller abort to canceled", async () => {
    const manual = manualDelay()
    const controller = new AbortController()
    controller.abort()
    const next: NextFn = () => Promise.resolve(okResponse)
    const intercepted = resilienceInterceptor({ timeoutMs: 1000, delay: manual.delay })(next)

    const error = await intercepted(fakeUnaryRequest(echo, { signal: controller.signal })).catch(
      (reason: unknown) => reason,
    )

    expect((error as ConnectError).code).toBe(Code.Canceled)
  })

  test("passes streaming messages through until completion", async () => {
    const manual = manualDelay()
    async function* source() {
      yield countResponse(1)
      yield countResponse(2)
    }
    const next: NextFn = () => streamResponse(source())
    const intercepted = resilienceInterceptor({ timeoutMs: 1000, delay: manual.delay })(next)

    const response = await intercepted(fakeStreamRequest(count))

    const values: number[] = []
    for await (const message of streamMessages(response)) {
      values.push(message.value)
    }
    expect(values).toEqual([1, 2])
  })

  test("fails a stalled stream as deadline_exceeded and cancels the underlying stream", async () => {
    const manual = manualDelay()
    let observed: { aborted: boolean } | undefined
    async function* source(signal: WebAbortSignal) {
      yield countResponse(1)
      // A real transport stream rejects its pending read when the call is aborted; mirror that so
      // teardown resolves once the idle guard cancels.
      await new Promise<never>((_, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })
      })
    }
    const next: NextFn = (request) => {
      observed = request.signal
      return streamResponse(source(request.signal))
    }
    const intercepted = resilienceInterceptor({ timeoutMs: 1000, delay: manual.delay })(next)

    const response = await intercepted(fakeStreamRequest(count))
    const iterator = streamMessages(response)[Symbol.asyncIterator]()
    expect((await iterator.next()).value?.value).toBe(1)

    const stalled = iterator.next().catch((reason: unknown) => reason)
    await flushMicrotasks()
    expect(manual.fireNext()).toBe(true)

    const error = await stalled
    expect(error).toBeInstanceOf(ConnectError)
    expect((error as ConnectError).code).toBe(Code.DeadlineExceeded)
    expect(observed?.aborted).toBe(true)
  })

  test("tears down the source stream on an early consumer break", async () => {
    const manual = manualDelay()
    let torndown = false
    async function* source() {
      try {
        yield countResponse(1)
        yield countResponse(2)
      } finally {
        torndown = true
      }
    }
    const next: NextFn = () => streamResponse(source())
    const intercepted = resilienceInterceptor({ timeoutMs: 1000, delay: manual.delay })(next)

    const response = await intercepted(fakeStreamRequest(count))
    for await (const message of streamMessages(response)) {
      expect(message.value).toBe(1)
      break
    }

    expect(torndown).toBe(true)
  })

  test("disposes the idle controller after normal completion, releasing the caller signal", async () => {
    const manual = manualDelay()
    let observed: WebAbortSignal | undefined
    async function* source() {
      yield countResponse(1)
    }
    const next: NextFn = (request) => {
      observed = request.signal
      return streamResponse(source())
    }
    const intercepted = resilienceInterceptor({ timeoutMs: 1000, delay: manual.delay })(next)

    const response = await intercepted(fakeStreamRequest(count))
    const values: number[] = []
    for await (const message of streamMessages(response)) {
      values.push(message.value)
    }

    expect(values).toEqual([1])
    // The combined signal handed to the transport aborts on exit, which is what unlinks its
    // listeners from the long-lived caller signal.
    expect(observed?.aborted).toBe(true)
  })

  test("propagates a delay failure instead of hanging the stream", async () => {
    const broken: Delay = () => Promise.reject(new RangeError("invalid ms"))
    // A read that never settles: only the delay's rejection can decide the race.
    const source: AsyncIterable<unknown> = {
      [Symbol.asyncIterator]() {
        return {
          next: () => new Promise(() => {}),
          return: () => Promise.resolve({ done: true, value: undefined }),
        }
      },
    }
    const next: NextFn = () => streamResponse(source)
    const intercepted = resilienceInterceptor({ timeoutMs: 1000, delay: broken })(next)

    const response = await intercepted(fakeStreamRequest(count))
    const error = await streamMessages(response)
      [Symbol.asyncIterator]()
      .next()
      .catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(RangeError)
  })
})

/** Wrap an output iterable as the minimal `StreamResponse` shape the resilience interceptor reads. */
function streamResponse(message: AsyncIterable<unknown>): Promise<Awaited<ReturnType<NextFn>>> {
  return Promise.resolve({ stream: true, message } as unknown as Awaited<ReturnType<NextFn>>)
}

/** The response's output iterable, typed for assertions. */
function streamMessages(response: Awaited<ReturnType<NextFn>>): AsyncIterable<{ value: number }> {
  return (response as unknown as { message: AsyncIterable<{ value: number }> }).message
}
