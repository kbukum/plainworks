// @vitest-environment jsdom

import { describe, expect, it } from "vitest"
import { AppConfigError } from "../errors"
import type { HydrationDocument, HydrationPayload } from "./script"
import { HYDRATION_SCRIPT_ID, readHydration, renderHydrationScript } from "./script"

// Parse the rendered markup the way the browser does, then read it back through the same
// structural document the client hands to `readHydration`.
function parseBody(html: string): Document {
  return new DOMParser().parseFromString(`<body>${html}</body>`, "text/html")
}

function documentWithText(text: string | null, id = HYDRATION_SCRIPT_ID): HydrationDocument {
  return {
    getElementById: (requested) => (requested === id ? { textContent: text } : null),
  }
}

const payload: HydrationPayload = {
  snapshot: { capabilities: { theme: { mode: "dark" } } },
  query: { queries: [], mutations: [] },
}

// A faithfully dehydrated, resolved query: the reader now validates every required state field, so
// tests that exercise a warm cache carry the full shape TanStack's `hydrate` reads.
const settledQuery = {
  queryKey: ["user", 1],
  queryHash: '["user",1]',
  state: {
    data: { id: 1 },
    dataUpdateCount: 1,
    dataUpdatedAt: 1,
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    fetchFailureCount: 0,
    fetchFailureReason: null,
    fetchMeta: null,
    isInvalidated: false,
    status: "success" as const,
    fetchStatus: "idle" as const,
  },
}

describe("renderHydrationScript", () => {
  it("writes one inert JSON data block the reader turns back into the payload", () => {
    const html = renderHydrationScript(payload)
    expect(html.startsWith(`<script type="application/json" id="${HYDRATION_SCRIPT_ID}">`)).toBe(
      true,
    )
    expect(readHydration(parseBody(html))).toEqual(payload)
  })

  it("round-trips a warm query cache through the settled query shape", () => {
    const warm: HydrationPayload = {
      snapshot: { capabilities: {} },
      query: { queries: [settledQuery], mutations: [] },
    }
    expect(readHydration(parseBody(renderHydrationScript(warm)))).toEqual(warm)
  })

  it("rejects a pending query that carries an untransportable promise", () => {
    const pending = {
      ...settledQuery,
      promise: Promise.resolve({ id: 1 }),
      state: { ...settledQuery.state, status: "pending", fetchStatus: "fetching", data: undefined },
    }
    expect(() =>
      renderHydrationScript({
        snapshot: { capabilities: {} },
        query: { queries: [pending], mutations: [] },
      } as unknown as HydrationPayload),
    ).toThrow(AppConfigError)
  })

  it("keeps hostile resolved text inside the script element", () => {
    const hostile: HydrationPayload = {
      snapshot: { capabilities: { note: "</script><script>alert(1)</script><!--" } },
    }
    const html = renderHydrationScript(hostile)
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(html).not.toContain("<!--")
    const parsed = parseBody(html)
    expect(parsed.querySelectorAll("script")).toHaveLength(1)
    expect(readHydration(parsed)).toEqual(hostile)
  })

  it("omits the query state when the payload has none", () => {
    const html = renderHydrationScript({ snapshot: { capabilities: {} } })
    expect(readHydration(parseBody(html))).toEqual({ snapshot: { capabilities: {} } })
  })

  it("writes and reads a custom element id", () => {
    const html = renderHydrationScript(payload, { id: "app-state" })
    expect(html).toContain('id="app-state"')
    expect(readHydration(parseBody(html), { id: "app-state" })).toEqual(payload)
  })

  it("rejects an id that could break out of the attribute", () => {
    expect(() => renderHydrationScript(payload, { id: 'x" onload="alert(1)' })).toThrow(
      AppConfigError,
    )
  })

  it("throws a typed error when a resolved value is not JSON-serializable", () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => renderHydrationScript({ snapshot: { capabilities: { circular } } })).toThrow(
      AppConfigError,
    )
    expect(() => renderHydrationScript({ snapshot: { capabilities: { bad: () => 1 } } })).toThrow(
      AppConfigError,
    )
  })
})

describe("readHydration", () => {
  it("fails with a typed error when the server rendered no script", () => {
    expect(() => readHydration({ getElementById: () => null })).toThrow(AppConfigError)
    expect(() => readHydration(documentWithText(""))).toThrow(AppConfigError)
    expect(() => readHydration(documentWithText(null))).toThrow(AppConfigError)
  })

  it.each([
    ["malformed JSON", "{not json"],
    ["a non-object payload", "[]"],
    ["a missing snapshot", JSON.stringify({ query: { queries: [], mutations: [] } })],
    ["array-valued capabilities", JSON.stringify({ snapshot: { capabilities: [] } })],
    ["a non-object query state", JSON.stringify({ snapshot: { capabilities: {} }, query: 1 })],
    [
      "query state without lists",
      JSON.stringify({ snapshot: { capabilities: {} }, query: { queries: {} } }),
    ],
    [
      "a null query entry",
      JSON.stringify({ snapshot: { capabilities: {} }, query: { queries: [null], mutations: [] } }),
    ],
    [
      "a query entry without a key",
      JSON.stringify({
        snapshot: { capabilities: {} },
        query: { queries: [{ queryHash: "x", state: {} }], mutations: [] },
      }),
    ],
    [
      "a query entry without state",
      JSON.stringify({
        snapshot: { capabilities: {} },
        query: { queries: [{ queryKey: ["x"], queryHash: "x" }], mutations: [] },
      }),
    ],
    [
      "a query state missing required fields",
      JSON.stringify({
        snapshot: { capabilities: {} },
        query: {
          queries: [{ queryKey: ["x"], queryHash: "x", state: {} }],
          mutations: [],
        },
      }),
    ],
    [
      "a query state with an unknown status",
      JSON.stringify({
        snapshot: { capabilities: {} },
        query: {
          queries: [
            {
              queryKey: ["x"],
              queryHash: "x",
              state: {
                data: null,
                dataUpdateCount: 1,
                dataUpdatedAt: 1,
                error: null,
                errorUpdateCount: 0,
                errorUpdatedAt: 0,
                fetchFailureCount: 0,
                isInvalidated: false,
                status: "loading",
                fetchStatus: "idle",
              },
            },
          ],
          mutations: [],
        },
      }),
    ],
    [
      "a mutation entry without state",
      JSON.stringify({ snapshot: { capabilities: {} }, query: { queries: [], mutations: [{}] } }),
    ],
  ])("rejects %s with a typed error", (_label, text) => {
    expect(() => readHydration(documentWithText(text))).toThrow(AppConfigError)
  })
})
