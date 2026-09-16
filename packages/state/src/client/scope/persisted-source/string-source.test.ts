// Default `node` environment: the shared string-medium source is driven with a hand-built backend
// so its serialize/write/clear failure paths — every one mapped to a typed StateSourceError with
// the cause preserved — are exercised directly, without a host.

import type { StandardSchemaV1, StateCapabilities, StateSerializer } from "@plainworks/std"
import { describe, expect, test } from "vitest"
import { StateConfigError, StateSourceError } from "../../../errors"
import { decodeEnvelope, encodeEnvelope } from "./envelope"
import { createStringSource, type StringBackend } from "./string-source"

const capabilities: StateCapabilities = {
  access: "sync",
  authority: "local",
  durable: true,
  sharedAcrossTabs: false,
  sentToServer: false,
  availableAtImport: false,
}

const identity: StateSerializer<string> = {
  serialize: (value) => value,
  deserialize: (raw) => raw,
}

function memoryBackend(overrides: Partial<StringBackend> = {}): StringBackend {
  let slot: string | null = null
  return {
    read: () => slot,
    write: (raw) => {
      slot = raw
    },
    clear: () => {
      slot = null
    },
    ...overrides,
  }
}

const build = (backend: StringBackend, serializer = identity) =>
  createStringSource({ capabilities, serializer, backend, medium: "test" })

describe("createStringSource failure mapping", () => {
  test("wraps a serialize failure, preserving the cause", async () => {
    const boom = new Error("cannot encode")
    const serializer: StateSerializer<string> = {
      serialize: () => {
        throw boom
      },
      deserialize: (raw) => raw,
    }
    const source = build(memoryBackend(), serializer)
    await expect(source.set("x")).rejects.toMatchObject({
      constructor: StateSourceError,
      cause: boom,
    })
  })

  test("wraps a write failure (quota/size) as a typed error", async () => {
    const source = build(
      memoryBackend({
        write: () => {
          throw new Error("quota exceeded")
        },
      }),
    )
    await expect(source.set("x")).rejects.toBeInstanceOf(StateSourceError)
  })

  test("wraps a clear failure as a typed error", async () => {
    const source = build(
      memoryBackend({
        clear: () => {
          throw new Error("locked")
        },
      }),
    )
    await expect(source.remove()).rejects.toBeInstanceOf(StateSourceError)
  })

  test("preserves an already-typed write failure (e.g. the cookie size guard) unchanged", async () => {
    const typed = new StateSourceError('Cookie "theme" is 4200 bytes, over the ~4096-byte limit.')
    const source = build(
      memoryBackend({
        write: () => {
          throw typed
        },
      }),
    )
    // The actionable typed error must survive, not be buried under the generic quota message.
    await expect(source.set("x")).rejects.toBe(typed)
  })

  test("preserves an already-typed clear failure (e.g. a missing host) unchanged", async () => {
    const typed = new StateSourceError("No document is available; pass options.jar.")
    const source = build(
      memoryBackend({
        clear: () => {
          throw typed
        },
      }),
    )
    await expect(source.remove()).rejects.toBe(typed)
  })

  test("preserves an already-typed serialize failure unchanged", async () => {
    const typed = new StateSourceError("Cannot JSON-serialize a function for storage.")
    const serializer: StateSerializer<string> = {
      serialize: () => {
        throw typed
      },
      deserialize: (raw) => raw,
    }
    const source = build(memoryBackend(), serializer)
    await expect(source.set("x")).rejects.toBe(typed)
  })

  test("wraps a raw host read failure as a typed error, preserving the cause", async () => {
    const boom = new Error("SecurityError")
    const source = build(
      memoryBackend({
        read: () => {
          throw boom
        },
      }),
    )
    await expect(source.get()).rejects.toMatchObject({
      constructor: StateSourceError,
      cause: boom,
    })
  })

  test("rethrows an already-typed read error unchanged (preserving its actionable message)", async () => {
    const typed = new StateSourceError("No localStorage is available; pass options.storage.")
    const source = build(
      memoryBackend({
        read: () => {
          throw typed
        },
      }),
    )
    await expect(source.get()).rejects.toBe(typed)
  })
})

describe("createStringSource schema validation at the read boundary", () => {
  const rejectingSchema: StandardSchemaV1<unknown, string> = {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: () => ({ issues: [{ message: "wrong shape" }] }),
    },
  }
  const acceptingSchema: StandardSchemaV1<unknown, string> = {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value) => ({ value: value as string }),
    },
  }

  test("a decoded value that fails the schema surfaces a typed error, never a fabricated value", async () => {
    const backend = memoryBackend()
    backend.write("tampered")
    const source = createStringSource({
      capabilities,
      serializer: identity,
      backend,
      schema: rejectingSchema,
      medium: "test",
    })
    await expect(source.get()).rejects.toBeInstanceOf(StateSourceError)
  })

  test("a valid decoded value passes the schema and is returned", async () => {
    const backend = memoryBackend()
    backend.write("ok")
    const source = createStringSource({
      capabilities,
      serializer: identity,
      backend,
      schema: acceptingSchema,
      medium: "test",
    })
    await expect(source.get()).resolves.toBe("ok")
  })

  test("an empty slot is undefined without invoking the schema", async () => {
    const source = createStringSource({
      capabilities,
      serializer: identity,
      backend: memoryBackend(),
      schema: rejectingSchema,
      medium: "test",
    })
    await expect(source.get()).resolves.toBeUndefined()
  })
})

describe("createStringSource schema versioning and migration", () => {
  interface Prefs {
    readonly label: string
  }
  const jsonSerializer: StateSerializer<Prefs> = {
    serialize: (value) => JSON.stringify(value),
    deserialize: (raw) => JSON.parse(raw) as Prefs,
  }
  // Version 1 stored `{ name }`; the current version 2 renamed it to `{ label }`.
  const versioning = {
    version: 2,
    migrate: (oldValue: unknown, oldVersion: number): Prefs => {
      if (oldVersion === 1) {
        return { label: (oldValue as { name: string }).name }
      }
      // A pre-versioning (v0) payload was already the current shape.
      return oldValue as Prefs
    },
  }
  const versioned = (backend: StringBackend) =>
    createStringSource({
      capabilities,
      serializer: jsonSerializer,
      backend,
      versioning,
      medium: "test",
    })

  test("a current-version payload is read unchanged", async () => {
    const backend = memoryBackend()
    backend.write(encodeEnvelope(2, JSON.stringify({ label: "dark" })))
    await expect(versioned(backend).get()).resolves.toEqual({ label: "dark" })
  })

  test("an older-version payload is migrated forward, never dropped", async () => {
    const backend = memoryBackend()
    backend.write(encodeEnvelope(1, JSON.stringify({ name: "dark" })))
    await expect(versioned(backend).get()).resolves.toEqual({ label: "dark" })
  })

  test("a pre-versioning payload is migrated from version 0", async () => {
    const backend = memoryBackend()
    // Persisted before versioning existed: a bare value, no envelope.
    backend.write(JSON.stringify({ label: "dark" }))
    await expect(versioned(backend).get()).resolves.toEqual({ label: "dark" })
  })

  test("a value from a newer, unknown version is a typed error, never fabricated", async () => {
    const backend = memoryBackend()
    backend.write(encodeEnvelope(3, JSON.stringify({ label: "dark" })))
    await expect(versioned(backend).get()).rejects.toBeInstanceOf(StateSourceError)
  })

  test("a migration that throws surfaces a typed error, preserving the cause", async () => {
    const boom = new Error("unmigratable")
    const backend = memoryBackend()
    backend.write(encodeEnvelope(1, JSON.stringify({ name: "dark" })))
    const source = createStringSource({
      capabilities,
      serializer: jsonSerializer,
      backend,
      versioning: {
        version: 2,
        migrate: () => {
          throw boom
        },
      },
      medium: "test",
    })
    await expect(source.get()).rejects.toMatchObject({ constructor: StateSourceError, cause: boom })
  })

  test("a write stamps the current version so the next read reconciles it", async () => {
    const backend = memoryBackend()
    await versioned(backend).set({ label: "light" })
    expect(decodeEnvelope(backend.read() as string)).toEqual({
      version: 2,
      payload: JSON.stringify({ label: "light" }),
    })
    await expect(versioned(backend).get()).resolves.toEqual({ label: "light" })
  })

  test("an empty slot is undefined without invoking migration", async () => {
    await expect(versioned(memoryBackend()).get()).resolves.toBeUndefined()
  })
})

describe("createStringSource versioning policy validation", () => {
  const withVersion = (version: number) =>
    createStringSource({
      capabilities,
      serializer: identity,
      backend: memoryBackend(),
      versioning: { version, migrate: (value) => value as string },
      medium: "test",
    })

  test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects a non-positive-integer version (%p) with a config error",
    (version) => {
      expect(() => withVersion(version)).toThrow(StateConfigError)
    },
  )

  test("accepts a positive integer version", () => {
    expect(() => withVersion(1)).not.toThrow()
  })
})
