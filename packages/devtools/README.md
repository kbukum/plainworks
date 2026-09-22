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

## The embedded inspector (`./client`)

`@plainworks/devtools/client` is the DOM/React shell: a diagnostics rail and a dockable, focus-managed inspector over a host-owned session. Import it only inside your host's build-time development gate so production bundles contain no devtools code or styles:

```tsx
if (import.meta.env.DEV) {
  const [{ mountDevtools }] = await Promise.all([
    import("@plainworks/devtools/client"),
    import("@plainworks/devtools/styles.css"),
  ])
  mountDevtools({ session })
}
```

`mountDevtools` mounts into an isolated React root and returns teardown; `DevtoolsShell` is the component form when you already render React. Pass kind-keyed custom panels via `renderers` — unknown kinds render through a generic panel with indicators, risk-separated commands, and on-demand detail. The shell automatically reserves bottom space when the diagnostics rail is active so it never covers focused controls.

## Optional adapters (`./query`, `./state`)

First-party adapters are imported only for the capabilities you use — an app that never imports them ships no adapter code:

```ts
import { createQuerySource } from "@plainworks/devtools/query"
import { createStateSource } from "@plainworks/devtools/state"

session.registerSource(createQuerySource({ client: queryClient, instance: "main" }))
session.registerSource(
  createStateSource({ store: cartStore, instance: "cart", snapshot: (s) => ({ items: s.items }) }),
)
```

Both are read-only views over public seams. The **query adapter** emits fetch/success/error lifecycle events and an aggregate health indicator (tracked/failing/fetching counts) without serializing the cache; one query's full state loads on demand. For deep cache and mutation inspection, render the maintained TanStack Query devtools as a custom panel beside it — Plainworks deliberately does not ship a competing cache inspector:

```tsx
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools"

mountDevtools({
  session,
  renderers: {
    query: () => (
      <QueryClientProvider client={queryClient}>
        <ReactQueryDevtoolsPanel />
      </QueryClientProvider>
    ),
  },
})
```

The **state adapter** shows bounded change summaries (which top-level keys changed, derived from the projected state, never raw or unwhitelisted values) and loads the full projected snapshot on demand. It is **private by default**: `snapshot` is required, so only the fields you whitelist at the boundary are ever summarized, retained, or forwarded — return the whole state (`(s) => s`) only when every field is safe to inspect. The **query adapter** projects keys safely via `keyLabel` and references queries with opaque internal identifiers so query keys and credentials never leak into event labels or detail tokens. Both adapters require an explicit `instance` label so multiple clients and stores never collide, and both honor the session's sanitize bounds — tokens, functions, and cycles never reach the panel. A source that recovers from a transient read/projection failure clears its failed state on the next healthy cycle rather than staying marked as failed.

## What the session guarantees

- **Serializable and versioned.** Every message carries a protocol version and contains only JSON-safe values — no functions, class instances, or cycles reach a consumer.
- **Private by default.** A source whitelists fields; the session then applies std redaction and depth, collection, and size limits before anything is retained or forwarded. Tokens and bodies never leak.
- **Bounded.** Per-source and aggregate history are fixed-capacity rings that drop the oldest entry and report the loss. High-frequency sources can wrap their emit with `createEventSampler` to coalesce or sample a burst before it reaches the ring.
- **Cancellable and owned.** Detail and command requests are cancellable and superseded cleanly; disposing the session releases every source, pending request, subscription, and buffer.
- **Read-only by default.** A source exposes a command only by opting in with a descriptor and a handler; the protocol never carries an executable callback.

## Runtime primitives

`@plainworks/devtools` is a **neutral (`.`)** package. It uses only the **universal** `AbortController` / `AbortSignal` value primitives directly and depends on no non-universal seam, so it runs on every target runtime (Node, edge, workers, RSC, React Native). The transport to the client is an injected `Bridge`; the default is a host-free in-memory bridge. The interactive inspector lives behind the **DOM (`./client`)** entry and is never the default import. See [`docs/architecture.md › Axis 2`](../../docs/architecture.md) for the primitive contract and the three entry buckets.
