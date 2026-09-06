import { expect, test } from "vitest"
import { fakeAuthHeaderProvider } from "./auth"

test("resolves the configured headers and counts calls", async () => {
  const auth = fakeAuthHeaderProvider({ headers: { authorization: "Bearer t" } })
  expect(auth.calls).toBe(0)
  expect(await auth.provider()).toEqual({ authorization: "Bearer t" })
  expect(auth.calls).toBe(1)
})

test("defaults to unauthenticated (undefined)", async () => {
  const auth = fakeAuthHeaderProvider()
  expect(await auth.provider()).toBeUndefined()
})

test("setHeaders swaps the resolved credential", async () => {
  const auth = fakeAuthHeaderProvider({ headers: { authorization: "old" } })
  auth.setHeaders({ authorization: "new" })
  expect(await auth.provider()).toEqual({ authorization: "new" })
  auth.setHeaders(undefined)
  expect(await auth.provider()).toBeUndefined()
})

test("sync provider throws when failWith is set, and clears again", async () => {
  const auth = fakeAuthHeaderProvider({ headers: {} })
  const boom = new Error("token refresh failed")
  auth.failWith(boom)
  expect(() => auth.provider()).toThrow(boom)
  auth.failWith(undefined)
  expect(await auth.provider()).toEqual({})
})

test("async provider rejects when failWith is set", async () => {
  const auth = fakeAuthHeaderProvider({ headers: {}, async: true })
  const boom = new Error("network down")
  auth.failWith(boom)
  await expect(auth.provider()).rejects.toBe(boom)
})

test("async provider resolves a promise of the headers", async () => {
  const auth = fakeAuthHeaderProvider({ headers: { x: "1" }, async: true })
  const result = auth.provider()
  expect(result).toBeInstanceOf(Promise)
  expect(await result).toEqual({ x: "1" })
})
