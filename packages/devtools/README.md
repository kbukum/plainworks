# @plainworks/devtools

> Development-only, host-independent runtime inspector with a neutral serializable session protocol.

Part of the [plainworks](../../README.md) kit.

`@plainworks/devtools` gives you one place to watch a composed Plainworks runtime — requests, state, cache, channel status — without tying your app to a browser extension, a dev server, or one host. You build a **session** from the capabilities you use, register **sources** that describe what can be observed, and connect a client to read a bounded, redacted, serializable stream of what is happening.

This entry (`.`) is host-independent: it touches no React, DOM, or host global, so it runs anywhere.

## Install

```sh
bun add @plainworks/devtools
```

## Quickstart

Construct a session, register a source beside the instance it observes, and connect a client:

```ts
import { createDevtoolsSession, type Source } from "@plainworks/devtools"

const session = createDevtoolsSession()

const source: Source = {
  id: { kind: "http", instance: "api" },
  label: "API client",
  connect(observer) {
    // Publish small, already-whitelisted summaries; the session sanitizes and bounds them.
    observer.emit({ kind: "request", label: "GET /tasks", severity: "ok", at: Date.now() })
    return { dispose: () => {} }
  },
}

const registration = session.registerSource(source)

const client = session.connect()
client.subscribe((message) => {
  /* drive the panel from ordered, sanitized messages */
})

// Later, on teardown:
registration.unsubscribe()
session.dispose()
```

## What the session guarantees

- **Serializable and versioned.** Every message carries a protocol version and contains only JSON-safe values — no functions, class instances, or cycles reach a consumer.
- **Private by default.** A source whitelists fields; the session then applies std redaction and depth, collection, and size limits before anything is retained or forwarded. Tokens and bodies never leak.
- **Bounded.** Per-source and aggregate history are fixed-capacity rings that drop the oldest entry and report the loss. High-frequency sources can `createEventSampler` to coalesce or sample before emitting.
- **Cancellable and owned.** Detail and command requests are cancellable and superseded cleanly; disposing the session releases every source, pending request, subscription, and buffer.
- **Read-only by default.** A source exposes a command only by opting in with a descriptor and a handler; the protocol never carries an executable callback.

## Runtime primitives

`@plainworks/devtools` is a **neutral (`.`)** package. It uses only the **universal** `AbortController` / `AbortSignal` value primitives directly and depends on no non-universal seam, so it runs on every target runtime (Node, edge, workers, RSC, React Native). The transport to the client is an injected `Bridge`; the default is a host-free in-memory bridge.

UI integrations belong in the browser/DOM bucket and remain separate from this neutral package. See [`docs/architecture.md › Axis 2`](../../docs/architecture.md) for the primitive contract and the three entry buckets.
