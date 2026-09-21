/**
 * Stable identity of an observed runtime instance. `kind` names the capability family (`"http"`,
 * `"state"`, `"query"`); `instance` distinguishes two instances of the same kind. The pair is
 * stable for the lifetime of the source so the panel can track it across reconnects and reject
 * events for an instance it no longer knows.
 */
export interface SourceId {
  readonly kind: string
  readonly instance: string
}

/**
 * A stable, comparable string key for a {@link SourceId}. Used as a map key when indexing sources,
 * retention buffers, and pending requests. `kind` and `instance` are joined so distinct pairs never
 * collide.
 */
export function sourceKey(id: SourceId): string {
  return `${id.kind.length}:${id.kind}${id.instance}`
}

/**
 * Structural equality for two {@link SourceId}s.
 */
export function sourceIdEquals(a: SourceId, b: SourceId): boolean {
  return a.kind === b.kind && a.instance === b.instance
}
