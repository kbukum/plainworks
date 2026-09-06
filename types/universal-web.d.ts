/**
 * The universal Web-platform globals every target runtime shares (Node, Deno, edge, browser, worker), declared narrowly so package source typechecks against ES-only libs without the DOM/WebWorker libs leaking host-only globals (`window`, `self`, `caches`, `indexedDB`) past the "assume no host" boundary. Included explicitly by each host-independent package tsconfig; host-bound tooling opts into `types: ["node"]` instead. Extend only with APIs that are genuinely universal.
 */

// Timer handles are intentionally opaque: Node returns an object, browsers a number.
declare function setTimeout(handler: () => void, timeout?: number): unknown
declare function clearTimeout(id?: unknown): void

declare interface AbortSignal {
  readonly aborted: boolean
  readonly reason: unknown
  addEventListener(type: string, listener: () => void, options?: { once?: boolean }): void
  removeEventListener(type: string, listener: () => void): void
}

declare const AbortSignal: {
  readonly prototype: AbortSignal
  new (): AbortSignal
  any(signals: readonly AbortSignal[]): AbortSignal
}

declare class AbortController {
  readonly signal: AbortSignal
  abort(reason?: unknown): void
}
