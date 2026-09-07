// Default `node` environment: the shared string-medium source is driven with a hand-built backend so
// its serialize/write/clear failure paths — every one mapped to a typed StateSourceError with the
// cause preserved — are exercised directly, without a host.

import type { StandardSchemaV1, StateCapabilities, StateSerializer } from "@plainworks/std"
import { describe, expect, test } from "vitest"
import { StateSourceError } from "../../errors"
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
