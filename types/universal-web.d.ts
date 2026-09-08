/**
 * Repo-only build shim that binds the universal Web-platform runtime globals (Node 18+, Deno, edge, browser, worker) so host-independent package *source* typechecks against ES-only libs without pulling the DOM/WebWorker libs (which would leak host-only globals `window`, `self`, `caches`, `indexedDB` past the "assume no host" boundary). Included explicitly by each host-independent package tsconfig; host-bound tooling opts into `types: ["node"]` instead.
 *
 * This file declares only the runtime *values* (constructors and `fetch`). Their instance and argument shapes come from the shipped, self-contained `@plainworks/std` web contract (`packages/std/src/web.ts`), so there is one source of truth and the emitted `.d.ts` of every package references those exported `Web*` types — never a repo-only ambient — and therefore typechecks standalone in a consumer that has neither DOM nor `@types/node`. These value globals appear only in `.js` output, so they are never part of any package's published type surface. Extend only with APIs that are genuinely universal.
 */

// Timer handles are intentionally opaque: Node returns an object, browsers a number.
declare function setTimeout(handler: () => void, timeout?: number): unknown
declare function clearTimeout(id?: unknown): void

declare const AbortSignal: {
  readonly prototype: import("@plainworks/std").WebAbortSignal
  new (): import("@plainworks/std").WebAbortSignal
  any(
    signals: readonly import("@plainworks/std").WebAbortSignal[],
  ): import("@plainworks/std").WebAbortSignal
}

declare const AbortController: {
  readonly prototype: import("@plainworks/std").WebAbortController
  new (): import("@plainworks/std").WebAbortController
}

declare const Headers: {
  readonly prototype: import("@plainworks/std").WebHeaders
  new (init?: import("@plainworks/std").WebHeadersInit): import("@plainworks/std").WebHeaders
}

declare const Response: {
  readonly prototype: import("@plainworks/std").WebResponse
  new (
    body?: import("@plainworks/std").WebBodyInit | null,
    init?: import("@plainworks/std").WebResponseInit,
  ): import("@plainworks/std").WebResponse
  json(
    data: unknown,
    init?: import("@plainworks/std").WebResponseInit,
  ): import("@plainworks/std").WebResponse
  error(): import("@plainworks/std").WebResponse
}

declare const fetch: import("@plainworks/std").WebFetch

declare const TextDecoder: {
  readonly prototype: import("@plainworks/std").WebTextDecoder
  new (
    label?: string,
    options?: { readonly fatal?: boolean; readonly ignoreBOM?: boolean },
  ): import("@plainworks/std").WebTextDecoder
}

declare const TextEncoder: {
  readonly prototype: import("@plainworks/std").WebTextEncoder
  new (): import("@plainworks/std").WebTextEncoder
}

declare const URLSearchParams: {
  readonly prototype: import("@plainworks/std").WebURLSearchParams
  new (
    init?:
      | string
      | readonly (readonly [string, string])[]
      | Record<string, string>
      | import("@plainworks/std").WebURLSearchParams,
  ): import("@plainworks/std").WebURLSearchParams
}

declare const URL: {
  readonly prototype: import("@plainworks/std").WebURL
  new (
    url: string | import("@plainworks/std").WebURL,
    base?: string | import("@plainworks/std").WebURL,
  ): import("@plainworks/std").WebURL
}
