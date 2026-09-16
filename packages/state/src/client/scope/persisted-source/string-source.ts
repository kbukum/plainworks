"use client"

import type {
  StandardSchemaV1,
  StateCapabilities,
  StateSerializer,
  StateSource,
} from "@plainworks/std"
import { validateWithSchema } from "@plainworks/std"
import { StateConfigError, StateSourceError } from "../../../errors"
import type { PersistedVersioning } from "../../../scope/scope"
import { decodeEnvelope, encodeEnvelope } from "./envelope"

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
 * boundary before it is adopted. When a `versioning` policy is supplied, a write stamps the current
 * version and a read migrates an older payload forward (a value from a newer, unknown version — or
 * a migration that throws — is a typed error, never a fabricated value).
 */
export function createStringSource<Value>(params: {
  readonly capabilities: StateCapabilities
  readonly serializer: StateSerializer<Value>
  readonly backend: StringBackend
  /** Optional Standard Schema validator run over the decoded value at the read trust boundary. */
  readonly schema?: StandardSchemaV1<unknown, Value>
  /** Optional schema-evolution policy: stamp the version on write, migrate an older read forward. */
  readonly versioning?: PersistedVersioning<Value>
  /** Medium label woven into typed errors, e.g. `"persistent Web Storage"` or `"cookie"`. */
  readonly medium: string
}): StateSource<Value> {
  const { capabilities, serializer, backend, schema, versioning, medium } = params
  if (
    versioning !== undefined &&
    !(Number.isSafeInteger(versioning.version) && versioning.version > 0)
  ) {
    // The contract promises a positive integer version. Reject a bad one at construction — a `0`
    // would make an unwrapped legacy payload look current and skip migration, and a
    // `NaN`/fractional value corrupts the stamped frame — rather than silently mis-versioning
    // persisted state.
    throw new StateConfigError(
      `A ${medium} versioning policy needs a positive integer version, received ${String(versioning.version)}.`,
    )
  }
  const listeners = new Set<() => void>()
  const notifyLocal = (): void => {
    // Snapshot so a listener that unsubscribes mid-dispatch does not disturb this pass.
    for (const listener of [...listeners]) listener()
  }

  const validate = async (value: Value): Promise<Value> => {
    if (schema === undefined) {
      return value
    }
    // Validate at the trust boundary: a tampered/wrong-shaped persisted value is a typed error,
    // never a fabricated `Value` handed back as if it were sound.
    const result = await validateWithSchema(schema, value)
    if (!result.ok) {
      throw new StateSourceError(`The persisted ${medium} value failed validation.`, {
        cause: result.error,
      })
    }
    return result.value
  }

  const deserialize = (payload: string): Value => {
    try {
      return serializer.deserialize(payload)
    } catch (cause) {
      throw new StateSourceError(`Could not deserialize the ${medium} value.`, { cause })
    }
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
      if (versioning === undefined) {
        return validate(deserialize(raw))
      }
      // Recover the stored version alongside the payload, then reconcile it against the current
      // version: adopt as-is when equal, migrate forward when older, and reject a value from an
      // unknown future rather than fabricate the current shape.
      const { version: stored, payload } = decodeEnvelope(raw)
      if (stored > versioning.version) {
        throw new StateSourceError(
          `The persisted ${medium} value is version ${stored}, newer than the supported version ${versioning.version}.`,
        )
      }
      const decoded = deserialize(payload)
      if (stored === versioning.version) {
        return validate(decoded)
      }
      let migrated: Value
      try {
        migrated = versioning.migrate(decoded, stored)
      } catch (cause) {
        throw new StateSourceError(
          `Could not migrate the ${medium} value from version ${stored} to ${versioning.version}.`,
          { cause },
        )
      }
      return validate(migrated)
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
      // Stamp the current version so the next read knows the shape it must reconcile against.
      const encoded = versioning === undefined ? raw : encodeEnvelope(versioning.version, raw)
      try {
        backend.write(encoded)
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
