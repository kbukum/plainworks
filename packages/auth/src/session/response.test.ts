import { expect, test } from "vitest"
import { decodeSessionResponse } from "./response"

const response = {
  status: "authenticated",
  identity: {
    subject: "service-123",
    kind: "service",
    restrictions: { mode: "restricted", resources: ["resource-one"], scopes: ["read"] },
  },
  expiresAt: "2026-01-01T01:00:00Z",
  csrfToken: "<signed-generation-bound-token>",
}

test("the published restricted service fixture decodes directly, including empty ceilings", () => {
  expect(decodeSessionResponse(response)).toEqual(response)
  const empty = {
    ...response,
    identity: {
      ...response.identity,
      restrictions: { mode: "restricted", resources: [], scopes: [] },
    },
  }
  expect(decodeSessionResponse(empty)).toEqual(empty)
})

test("malformed identities, expiry and CSRF fail at the browser boundary", () => {
  for (const value of [
    null,
    { ...response, status: "anonymous" },
    { ...response, identity: { subject: "user" } },
    { ...response, expiresAt: "never" },
    { ...response, expiresAt: "9999-99-99T99:99:99Z" },
    ...["2026-02-29T00:00:00Z", "2026-04-31T00:00:00Z", "2026-01-01T24:00:00Z"].map(
      (expiresAt) => ({ ...response, expiresAt }),
    ),
    { ...response, csrfToken: "" },
    { ...response, csrfToken: "x".repeat(257) },
    { ...response, identity: { ...response.identity, restrictions: { mode: "restricted" } } },
  ])
    expect(() => decodeSessionResponse(value)).toThrow()
})
