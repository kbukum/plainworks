# @plainworks/channel

> Host-independent streaming-connection core — one lifecycle/reconnect state machine, pluggable `sse` and `ws` transport adapters, header-only resume, and a typed event router — with `std`-powered backoff, retry classification, and bounded backpressure.

Part of the [plainworks](../../README.md) kit.

## Install

```sh
bun add @plainworks/channel
```

## Runtime primitives

`channel` is a **neutral (`.`)** package. The core references no host global — it drives the wire only through an **injected transport factory**, so the non-universal primitives (`fetch` + `ReadableStream` for SSE, the `WebSocket` constructor for WS) enter through a seam with a platform default. A worker with no `EventSource`, React Native needing a polyfill, or a custom host each supplies its own transport without forking the core. Timers and RNG are injected `std` seams (`delay`, `clock`, `random`) that default to the host, so timing is deterministic under test. The React hooks live at the separate **`./client`** entry and are **DOM-free** (React-without-DOM), so they run in the browser, a Next client tree, and React Native alike. See [`docs/architecture.md › Axis 2`](../../docs/architecture.md) for the primitive contract.

## Server-safe core (`.`)

`createChannel` is a **factory**, never a module-level singleton — each call returns one logical stream with its own lifecycle, so nothing leaks across SSR requests. It owns lifecycle and stable-open gating; **reconnection, jittered backoff, the retry ceiling, and retry classification all come from `std`** — this package keeps no private backoff copy.

```ts
import { createChannel } from "@plainworks/channel"
import { createSseTransport } from "@plainworks/channel"

const channel = createChannel({
  transport: createSseTransport({ url: "https://api.example.com/stream" }),
  authProvider: async () => ({ Authorization: `Bearer ${await token()}` }),
  onStatusChange: (status) => log(status),
})

const sub = channel.on("message", (frame) => render(frame.data))
channel.connect()
// … later
sub.unsubscribe()
channel.close()
```

### Lifecycle

A channel moves through `idle → connecting → open → reconnecting → closing → closed`. The reconnect loop is bounded and self-healing:

- **Header-only auth.** The `authProvider` credential is attached as a header on **every** attempt, re-resolved on reconnect for token refresh. A token never lands in a URL.
- **Fatal vs retryable.** Classification comes from `std`: a `401`/`403` is fatal and stops the loop (**S1**) rather than reconnecting forever; a transient failure retries with jittered backoff.
- **Stable-open gating.** Backoff resets only after a connection stays open for `minUptimeMs` (**S3**), so a flapping stream escalates backoff instead of hammering the server.
- **Timeouts.** `connectTimeoutMs` bounds each connection attempt; the optional `idleTimeoutMs` aborts and reconnects a half-dead stream that stops delivering frames without erroring (**S4**).
- **Ceiling.** `maxRetries` bounds a run of **consecutive** retries — a stable open resets the count, so it caps a failure burst, not the channel's lifetime.

`connect()` and `close()` are idempotent. `status` and `lastEventId` are readable at any time; `lastEventId` is sent as `Last-Event-ID` on reconnect for header-only resume.

## Transports

A transport is a `TransportFactory` injected into `createChannel`. The core never imports a wire global — it calls the factory.

### SSE — `createSseTransport`

Built on the platform `fetch` + `Response.body` + [`eventsource-parser`](https://github.com/rexxars/eventsource-parser) (not `@microsoft/fetch-event-source`). Honors `Last-Event-ID` for resume and the server's `retry:` hint. The whole decode buffer is bounded by `maxBufferChars` (**S2**) — an overflow raises a typed `channel/protocol` error rather than growing unbounded. `fetch` is an injectable seam (`options.fetch`) that defaults to the host.

```ts
createSseTransport({ url: "https://api.example.com/stream", maxBufferChars: 1_048_576 })
```

### WebSocket — `createWsTransport`

Reconnect-aware WS with an app-level keep-alive ping driven by the injected `delay` seam. The ping keeps NATs and proxies from dropping an idle connection, but it does **not** detect a dead peer on its own — for liveness, configure `idleTimeoutMs` on the channel so a silent stream (no frames, including pongs) is aborted and reconnected. The socket constructor is an injected `WebSocketFactory` (`socketFactory`) defaulting to `globalThis.WebSocket`. Because a browser `WebSocket` cannot set request headers, the factory receives the resolved auth headers and a header-capable host socket (e.g. Node `ws`) forwards them; the default browser factory refuses an attempt that carries headers rather than silently dropping credentials.

```ts
createWsTransport({
  url: async () => `wss://api.example.com/stream`, // re-resolved per attempt (endpoint rotation) — never a credential
  heartbeat: { intervalMs: 15_000 },
})
```

## Event router

The channel delivers raw `ChannelFrame`s. The **event router** adds a typed layer: decode a frame to `{ type, payload, id }`, then fan it out to sinks. Delivery is drained through `std`'s bounded queue, so a slow sink applies backpressure instead of buffering without limit.

```ts
import { createEventRouter, createStateSink, jsonDecoder } from "@plainworks/channel"

const router = createEventRouter<{ n: number }>({
  channel,
  decode: jsonDecoder((v) => userSchema.parse(v)),
  sinks: [createStateSink(stateSource, (event, current) => [...(current ?? []), event.payload])],
  onError: (err) => log(err),
})
// … later
router.close()
```

`jsonDecoder` parses the frame body and hands the untrusted value to your validator. A malformed-JSON or validation failure is reported to `onError` and the frame is dropped — one bad frame never tears down the stream. `createStateSink` folds events into a `std` `StateSource` (the `state` store as the `memory` scope), so the sink writes through one state contract rather than reaching into a store directly. `EventSink` is the seam for any custom sink.

## Client bindings (`./client`)

`createChannelContext` returns a `ChannelProvider` plus DOM-free hooks. The Provider builds the channel **once** on mount (like a per-request store) — no module singleton.

```tsx
"use client"
import { createSseTransport } from "@plainworks/channel"
import { createChannelContext } from "@plainworks/channel/client"

const { ChannelProvider, useChannelStatus, useChannelEvent } = createChannelContext()
const url = "https://api.example.com/stream"

function Feed() {
  const status = useChannelStatus()
  useChannelEvent("message", (frame) => append(frame.data))
  return <span>{status}</span>
}

function App() {
  return (
    <ChannelProvider options={{ transport: createSseTransport({ url }) }}>
      <Feed />
    </ChannelProvider>
  )
}
```

`useChannel` returns the live channel (and throws outside its Provider); `useChannelStatus` re-renders on lifecycle transitions; `useChannelEvent(type, listener)` and `useAnyChannelEvent(listener)` subscribe with automatic teardown.

## Typed errors

`ChannelError` is the package's typed failure family; callers branch on its `kind`:

| `kind` | Cause |
|---|---|
| `channel/config` | invalid construction (a bad URL provider, missing socket factory, hook used outside its Provider) |
| `channel/connect` | a connection attempt failed to establish |
| `channel/protocol` | a wire/decoding fault (non-2xx SSE response, decode-buffer overflow) |
| `channel/closed` | terminal closure — reconnection was exhausted; the last failure is preserved as `cause` |

The error preserves its `cause`. Terminal failures are also delivered to the `onError` callback when the channel closes after exhausting retries or hitting a fatal error.
