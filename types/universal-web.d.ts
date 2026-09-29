/**
 * Repo-only build shim that binds the universal Web-platform runtime globals (Node 18+, Deno, edge, browser, worker) so host-independent package *source* typechecks against ES-only libs without pulling the DOM/WebWorker libs (which would leak host-only globals `window`, `self`, `caches`, `indexedDB` past the "assume no host" boundary). Included explicitly by each host-independent package tsconfig; host-bound tooling opts into `types: ["node"]` instead.
 *
 * This file declares only the runtime *values* (constructors and `fetch`). Their instance and argument shapes come from the shipped, self-contained `@plainworks/std` web contract (`packages/std/src/web/types.ts`), so there is one source of truth and the emitted `.d.ts` of every package references those exported `Web*` types — never a repo-only ambient — and therefore typechecks standalone in a consumer that has neither DOM nor `@types/node`. These value globals appear only in `.js` output, so they are never part of any package's published type surface. Extend only with APIs that are genuinely universal.
 */

// Timer handles are intentionally opaque: Node returns an object, browsers a number.
declare function setTimeout(handler: () => void, timeout?: number): unknown
declare function clearTimeout(id?: unknown): void

declare const AbortSignal: {
  readonly prototype: import("@plainworks/std/web").WebAbortSignal
  new (): import("@plainworks/std/web").WebAbortSignal
  any(
    signals: readonly import("@plainworks/std/web").WebAbortSignal[],
  ): import("@plainworks/std/web").WebAbortSignal
}

declare const AbortController: {
  readonly prototype: import("@plainworks/std/web").WebAbortController
  new (): import("@plainworks/std/web").WebAbortController
}

declare const Headers: {
  readonly prototype: import("@plainworks/std/web").WebHeaders
  new (
    init?: import("@plainworks/std/web").WebHeadersInit,
  ): import("@plainworks/std/web").WebHeaders
}

declare const Response: {
  readonly prototype: import("@plainworks/std/web").WebResponse
  new (
    body?: import("@plainworks/std/web").WebBodyInit | null,
    init?: import("@plainworks/std/web").WebResponseInit,
  ): import("@plainworks/std/web").WebResponse
  json(
    data: unknown,
    init?: import("@plainworks/std/web").WebResponseInit,
  ): import("@plainworks/std/web").WebResponse
  error(): import("@plainworks/std/web").WebResponse
}

declare const fetch: import("@plainworks/std/web").WebFetch

declare const TextDecoder: {
  readonly prototype: import("@plainworks/std/web").WebTextDecoder
  new (
    label?: string,
    options?: { readonly fatal?: boolean; readonly ignoreBOM?: boolean },
  ): import("@plainworks/std/web").WebTextDecoder
}

declare const TextEncoder: {
  readonly prototype: import("@plainworks/std/web").WebTextEncoder
  new (): import("@plainworks/std/web").WebTextEncoder
}

declare const URLSearchParams: {
  readonly prototype: import("@plainworks/std/web").WebURLSearchParams
  new (
    init?:
      | string
      | readonly (readonly [string, string])[]
      | Record<string, string>
      | import("@plainworks/std/web").WebURLSearchParams,
  ): import("@plainworks/std/web").WebURLSearchParams
}

declare const URL: {
  readonly prototype: import("@plainworks/std/web").WebURL
  new (
    url: string | import("@plainworks/std/web").WebURL,
    base?: string | import("@plainworks/std/web").WebURL,
  ): import("@plainworks/std/web").WebURL
}
