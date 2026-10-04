import { describe, expect, test } from "vitest"
import { createSessionFixture } from "."

const ADA = { subject: "u-1", claims: { name: "Ada" } }

describe("createSessionFixture", () => {
  test("a signed-in fixture confirms its identity through the session protocol", async () => {
    const store = createSessionFixture({ status: "authenticated", identity: ADA })
    await store.confirm()
    const snapshot = store.getSnapshot()
    expect(snapshot.status).toBe("authenticated")
    expect(snapshot.identity).toMatchObject(ADA)
    expect(snapshot.expiresAt).toBe("2000-01-01T01:00:00Z")
  })

  test("a signed-out fixture answers status like a host with no session", async () => {
    const store = createSessionFixture()
    await expect(store.revalidate()).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    expect(store.getSnapshot()).toMatchObject({ status: "unauthenticated", identity: null })
  })
})
