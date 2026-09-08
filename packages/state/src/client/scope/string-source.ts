"use client"

import type {
  StandardSchemaV1,
  StateCapabilities,
  StateSerializer,
  StateSource,
} from "@plainworks/std"
import { validateWithSchema } from "@plainworks/std"
import { StateSourceError } from "../../errors"

/**
 * The raw string medium a storage-backed scope reads and writes for one already-keyed value slot
 * (Web Storage, a cookie, a URL param). The scope binds the key when it builds a backend, so these
 * methods carry no key — one backend is one slot.
 */
export interface StringBackend {
  /** Read the stored string, or `null` when the slot is empty. */
  read(): string | null
  /** Persist the encoded string. May throw (quota, size limit) — mapped to a typed error. */
  write(raw: string): void
  /** Remove the slot. */
  clear(): void
  /**
   * Register a listener for changes made **outside** this source — another tab's `storage` event, a
   * `popstate`. Returns teardown. Omit when the medium has no external change signal (a cookie).
   */
  subscribeExternal?(onChange: () => void): () => void
}

/**
 * Build a {@link StateSource} over a string {@link StringBackend}, shared by every storage-backed
 * scope so serialization, typed-error mapping, and subscription bookkeeping live in one place
 * rather than being re-implemented per medium.
 *
 * The source owns a **local** listener set (its own writes notify synchronously, since Web
 * Storage's `storage` event never fires in the tab that made the change) and, when the backend
 * provides one, an **external** subscription for cross-tab / navigation changes. `unsubscribe`
 * detaches both, so no host listener outlives its subscription. A read, (de)serialize, or write
 * failure is wrapped in a typed {@link StateSourceError} that preserves the cause — an untrusted
 * persisted string never escapes as a raw host error or a fabricated value, and a rejected write is
 * never swallowed. When a `schema` is supplied the decoded value is validated at this trust
 * boundary before it is adopted.
 */
export function createStringSource<Value>(params: {
  readonly capabilities: StateCapabilities
  readonly serializer: StateSerializer<Value>
  readonly backend: StringBackend
  /** Optional Standard Schema validator run over the decoded value at the read trust boundary. */
  readonly schema?: StandardSchemaV1<unknown, Value>
  /** Medium label woven into typed errors, e.g. `"persistent Web Storage"` or `"cookie"`. */
  readonly medium: string
}): StateSource<Value> {
  const { capabilities, serializer, backend, schema, medium } = params
  const listeners = new Set<() => void>()
  const notifyLocal = (): void => {
    // Snapshot so a listener that unsubscribes mid-dispatch does not disturb this pass.
    for (const listener of [...listeners]) listener()
  }

  return {
    capabilities,
    get: async () => {
      let raw: string | null
      try {
        raw = backend.read()
      } catch (cause) {
        // A host read can throw (Web Storage `SecurityError`, a malformed cookie, an invalid URL) —
        // map a raw host error to the typed contract. An already-typed error (e.g. host-absent,
        // which names its escape hatch) is rethrown as-is so its actionable message is preserved.
        if (cause instanceof StateSourceError) {
          throw cause
        }
        throw new StateSourceError(`Could not read the ${medium} value.`, { cause })
      }
      if (raw === null) {
        return undefined
      }
      let decoded: Value
      try {
        decoded = serializer.deserialize(raw)
      } catch (cause) {
        throw new StateSourceError(`Could not deserialize the ${medium} value.`, { cause })
      }
      if (schema === undefined) {
        return decoded
      }
      // Validate the decoded value at the trust boundary: a tampered/wrong-shaped persisted value
      // is a typed error, never a fabricated `Value` handed back as if it were sound.
      const result = await validateWithSchema(schema, decoded)
      if (!result.ok) {
        throw new StateSourceError(`The persisted ${medium} value failed validation.`, {
          cause: result.error,
        })
      }
      return result.value
    },
    set: async (value) => {
      let raw: string
      try {
        raw = serializer.serialize(value)
      } catch (cause) {
        if (cause instanceof StateSourceError) {
          throw cause
        }
        throw new StateSourceError(`Could not serialize the ${medium} value.`, { cause })
      }
      try {
        backend.write(raw)
      } catch (cause) {
        // Preserve an already-typed backend failure (the cookie size guard, a missing host) as-is
        // so its actionable message survives, then wrap only a raw host error in the generic quota
        // text.
        if (cause instanceof StateSourceError) {
          throw cause
        }
        throw new StateSourceError(`Could not write the ${medium} value (quota or size limit?).`, {
          cause,
        })
      }
      notifyLocal()
    },
    remove: async () => {
      try {
        backend.clear()
      } catch (cause) {
        if (cause instanceof StateSourceError) {
          throw cause
        }
        throw new StateSourceError(`Could not remove the ${medium} value.`, { cause })
      }
      notifyLocal()
    },
    subscribe: (onChange) => {
      listeners.add(onChange)
      const externalTeardown = backend.subscribeExternal?.(onChange)
      return {
        unsubscribe: () => {
          listeners.delete(onChange)
          externalTeardown?.()
        },
      }
    },
  }
}
