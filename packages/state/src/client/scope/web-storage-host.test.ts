// Default `node` environment: with no host Web Storage present, constructing the source must stay
// safe (so a Provider renders on the server), but the first host access must fail with a typed,
// actionable error naming the injection escape hatch — proving the neutral runtime is guarded, not
// silently broken.
import { expect, test } from "vitest"
import { StateSourceError } from "../../errors"
import { jsonSerializer } from "../../scope/serializer"
import { persistentScope, sessionScope } from "./web-storage"

const spec = { key: "theme", serializer: jsonSerializer<string>() }

test("persistent scope defers a typed localStorage error to the first read", async () => {
  const source = persistentScope.createSource(spec) // construction is host-free (SSR-safe)
  await expect(source.get()).rejects.toThrow(StateSourceError)
  await expect(source.get()).rejects.toThrow(/localStorage/)
})

test("session scope defers a typed sessionStorage error to the first read", async () => {
  const source = sessionScope.createSource(spec)
  await expect(source.get()).rejects.toThrow(StateSourceError)
  await expect(source.get()).rejects.toThrow(/sessionStorage/)
})
