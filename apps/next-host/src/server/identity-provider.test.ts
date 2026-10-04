import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { createRequestJar } from "@plainworks/auth/server"
import { afterEach, expect, test } from "vitest"
import { type HostAuth, withHostAuth } from "./identity-provider"

const roots: string[] = []
function options() {
  mkdirSync(".turbo", { recursive: true })
  const directory = mkdtempSync(".turbo/host-auth-")
  roots.push(directory)
  return { directory, origin: "https://host.test", allowCreate: true, demo: true }
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function cookieHeader(cookies: readonly string[]): string {
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ")
}

test("request-local login, callback, status and logout persist across recreation and close", async () => {
  const config = options()
  const begin = await withHostAuth(async ({ auth, idp }) => {
    const request = createRequestJar({ headers: new Headers() })
    const login = await auth.session.beginLogin(request.jar)
    return { cookies: request.cookies, callback: idp.authorize(login.authorizationUrl).callbackUrl }
  }, config)
  const login = await withHostAuth(async ({ auth }) => {
    const request = createRequestJar({
      headers: new Headers({ cookie: cookieHeader(begin.cookies) }),
    })
    await auth.session.completeLogin(request.jar, {
      params: Object.fromEntries(new URL(begin.callback).searchParams),
    })
    return request.cookies
  }, config)
  const cookie = cookieHeader(login)
  let borrowed: HostAuth | undefined
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      withHostAuth(async (host) => {
        borrowed = host
        return host.auth.read(cookie)
      }, config),
    ),
  )
  expect(results.every((result) => result.authenticated)).toBe(true)
  await expect(borrowed?.auth.read(cookie)).rejects.toThrow()
  await withHostAuth(async ({ auth }) => {
    await auth.session.logout(createRequestJar({ headers: new Headers({ cookie }) }).jar)
  }, config)
  expect(await withHostAuth(({ auth }) => auth.read(cookie), config)).toMatchObject({
    authenticated: false,
  })
})

test("concurrent first use shares custody and failed callbacks still close every resource", async () => {
  const config = options()
  expect(
    await Promise.all(
      Array.from({ length: 4 }, () => withHostAuth(({ auth }) => auth.read(""), config)),
    ),
  ).toHaveLength(4)
  let borrowed: HostAuth | undefined
  await expect(
    withHostAuth(async (host) => {
      borrowed = host
      throw new Error("request failed")
    }, config),
  ).rejects.toThrow("request failed")
  await expect(borrowed?.idp.fetch("https://idp.test/jwks")).rejects.toThrow(/closed/)
  await expect(
    withHostAuth(async () => undefined, {
      ...config,
      configuredKey: Buffer.alloc(32, 8).toString("base64url"),
    }),
  ).rejects.toThrow(/mismatch/)
  await expect(withHostAuth(async () => undefined, { ...config, demo: false })).rejects.toThrow(
    /demo/,
  )
  await expect(
    withHostAuth(async () => undefined, { ...config, allowCreate: false }),
  ).rejects.toThrow(/configured/)
})
