# @plainworks/channel

> Host-independent streaming-connection core — one lifecycle/reconnect state machine, pluggable `sse` and `ws` transports, header-only resume, and a typed event router — with `std`-powered backoff, retry classification, and bounded backpressure.

Part of the [plainworks](../../README.md) kit.

## Install

```sh
bun add @plainworks/channel
```

## Runtime primitives

`channel` is a **neutral (`.`)** package. The core references no host global — it drives the wire only through an **injected transport factory**, so the non-universal primitives (`fetch` + `ReadableStream` for SSE, the `WebSocket` constructor for WS) enter through a seam with a platform default. A worker with no `EventSource`, React Native needing a polyfill, or a custom host each supplies its own transport without forking the core. Timers and RNG are injected `std` seams (`delay`, `clock`, `random`) that default to the host, so timing is deterministic under test. The React hooks live at the separate **`./client`** entry and are **DOM-free** (React-without-DOM), so they run in the browser, a Next client tree, and React Native alike. See [`docs/architecture.md › Runtime primitives`](../../docs/architecture.md#runtime-primitives) for the primitive contract.

## Entries

| Entry | What it holds |
|---|---|
| `.` | `createChannel`, the channel status, and the typed `ChannelError`. |
| `./transport` | The SSE and WebSocket transports. |
| `./events` | The event router, decoders, and sinks. |
| `./client` | The React Provider and hooks (`"use client"`, DOM-free). |

The transport contract (`StreamTransport`, `StreamFrame`) comes from `@plainworks/std/seam`.

## Server-safe core (`.`)

`createChannel` is a **factory**, never a module-level singleton — each call returns one logical stream with its own lifecycle, so nothing leaks across SSR requests. It owns lifecycle and stable-open gating; **reconnection, jittered backoff, the retry ceiling, and retry classification all come from `std`** — this package keeps no private backoff copy.

```ts
import { createChannel } from "@plainworks/channel"
import { createSseTransport } from "@plainworks/channel/transport"

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

- **Header-only auth.** The `authProvider` credential is attached as a header on every attempt. A token never lands in a URL. Expired or revoked sessions stop the stream and require login; the channel never runs a token-refresh loop.
- **Fatal vs retryable.** Classification comes from `std`: a `401`/`403` is fatal and stops the loop (**S1**) rather than reconnecting forever; a transient failure retries with jittered backoff.
- **Stable-open gating.** A clean end after `minUptimeMs` resets the failure burst. Explicit retryable failures keep their retry hints and attempt count, even after a stable open.
- **Timeouts.** `connectTimeoutMs` bounds each connection attempt; the optional `idleTimeoutMs` aborts and reconnects a half-dead stream that stops delivering frames without erroring (**S4**).
- **Ceiling.** `maxRetries` and `retryBudgetMs` bound each failure burst, including connection admission and backoff. Healthy uptime is excluded. Waits use `max(server minimum, jittered backoff)`; a hint that cannot fit ends retries instead of being shortened.

`connect()` and `close()` are idempotent. `lastEventId` is the last **acknowledged delivery**, not the last received frame. The router acknowledges only after every sink succeeds; direct consumers must call `acknowledge(frame)` after applying it. Reconnect sends that cursor only in `Last-Event-ID`. Reset, queue overflow, and explicit close invalidate outstanding delivery leases.

**Terminal failures stay visible.** `channel.error` retains the session's terminal failure until an explicit `connect()` starts a new session. A router attached after failure immediately reports that outcome and closes its sinks. Rebuilding a query or view cannot silently forget a dead stream.

### Published event protocol

Application event names are full protobuf message names. `protobufDecoder(schema)` uses the generated descriptor, validates proto JSON, and requires `<32 lowercase hex epoch>:<uint64 decimal sequence>`. Sequence comparisons use bigint; gaps from authorization filtering are valid.

`connected` carries `{epoch,cursor}`. `reset` carries `{reason,cursor}`, where reason is `epochChanged`, `replayExpired`, or `overflow`. Neither control acknowledges an application event, including when the SSE parser inherits an earlier ID. Reset forgets the old resume cursor. A `failure` control uses the shared failure vocabulary and settles the connection before EOF; pre-stream problem responses use the same typed decoder. `ChannelError` exposes `code`, `retryable`, `retryAfterMs`, and `authentication` alongside its transport kind and cause.

## Transports

A transport is a `StreamTransportFactory` injected into `createChannel`. The core never imports a wire global — it calls the factory. The transport contract (`StreamTransport`, `StreamFrame`, and friends) is a neutral, host-independent seam owned by `@plainworks/std/seam`, so a custom transport depends only on `std`.

### SSE — `createSseTransport`

Built on the platform `fetch` + `Response.body` + [`eventsource-parser`](https://github.com/rexxars/eventsource-parser) (not `@microsoft/fetch-event-source`). Honors `Last-Event-ID` for resume and the server's `retry:` hint, including standalone directives followed by EOF. The whole decode buffer is bounded by `maxBufferChars` (**S2**) — an overflow raises a typed `channel/protocol` error rather than growing unbounded. `fetch` is an injectable seam (`options.fetch`) that defaults to the host.

The transport **owns the response body**. An abort, an overflow, or a listener that throws cancels the body stream, and every exit releases the reader, so a stream never outlives its attempt.

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

The channel delivers raw `StreamFrame`s. The event router decodes each into `{type,data}`, then delivers it to every sink in order. One bounded queue owns delivery and acknowledgement. Build one router per channel.

```ts
import { createEventRouter, protobufDecoder } from "@plainworks/channel/events"
import { createLiveQuery } from "@plainworks/query/cache"
import { TaskChangedSchema } from "./gen/events_pb"

const live = createLiveQuery(client, { queryKey: ["tasks"], queryFn: readSnapshot })
const router = createEventRouter({
  channel,
  decode: protobufDecoder(TaskChangedSchema),
  sinks: [live],
  onError: (err) => log(err),
})
channel.connect() // the connected boundary starts the first snapshot
// … later
router.close() // also closes the live snapshot owner
channel.close()
```

**Overflow never goes unseen.** The buffer holds `capacity` events (default 1024). When it is full, `overflow` picks what to lose:

| `overflow` | What it drops |
|---|---|
| `drop-oldest` (default) | The oldest buffered event, so the freshest wins. |
| `drop-new` | The new event. |
| `reject` | The new event, like `drop-new`. The stream keeps running. |

The overflow-triggering drop reaches `onDrop` and optional `telemetry` as `channel.event.dropped`. Any overflow also cancels the old delivery generation, forgets resume, and calls sink `reset` hooks. Old queued frames cannot be applied or acknowledged after that gap. Decode and sink failures report through `onError` and enter the same recovery path.

Use `createLiveQuery` for snapshot-backed state, including disabled remote-cache subscribers. Without an atomic snapshot watermark, events invalidate rather than overlay deltas. Recovery coalesces, rejects raced snapshots, and stops visibly stale after its budget; [Query's live owner](../query/README.md#live-snapshots) documents this contract. Custom history-dependent sinks must implement `reset`; notification-only sinks need not.

`jsonDecoder` and `createStateSink` remain available for other validated event contracts. They do not provide snapshot convergence on their own.

## Client bindings (`./client`)

`createChannelContext` returns a `ChannelProvider` plus DOM-free hooks. The Provider builds the channel **once** on mount (like a per-request store) — no module singleton.

```tsx
"use client"
import { createSseTransport } from "@plainworks/channel/transport"
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
