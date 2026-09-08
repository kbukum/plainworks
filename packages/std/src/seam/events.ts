/**
 * A decoded, typed application event — the shape a transport hands to whatever routes events into
 * the tools the app already has (the query cache, a state store). `TType` is the discriminant;
 * `TData` is the decoded payload.
 */
export interface PlainEvent<TType extends string = string, TData = unknown> {
  /** Discriminant identifying what happened. */
  readonly type: TType
  /** Decoded payload for this event. */
  readonly data: TData
}

/** Callback invoked with each emitted value. */
export type Listener<T> = (value: T) => void

/**
 * Handle returned by every subscription. Call `unsubscribe` exactly once to detach the listener and
 * release its resources — the canonical teardown contract for streams, emitters, and stores.
 */
export interface Subscription {
  unsubscribe(): void
}
