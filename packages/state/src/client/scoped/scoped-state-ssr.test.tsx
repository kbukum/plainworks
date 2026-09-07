// Default `node` environment: proves the surface renders on the server with no host and that two
// concurrent requests never share state — the SSR-safety guarantee, verified without a browser.

import type { StateSource } from "@plainworks/std"
import { fakeStateSource } from "@plainworks/testkit"
import type { ReactNode } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { memoryScope } from "../../scope/memory"
import type { Scope, SourceSpec } from "../../scope/scope"
import { cookieScope, persistentScope, sessionScope, urlScope } from "../scope"
import { createScopedState } from "./scoped-state"

interface Prefs {
  theme: string
}

function scopeOf(source: StateSource<Prefs>): Scope {
  return {
    name: "test",
    capabilities: source.capabilities,
    createSource: <Value,>(_spec: SourceSpec<Value>) => source as unknown as StateSource<Value>,
  }
}

describe("createScopedState — server rendering", () => {
  test("renders the seed on the server without touching a host", () => {
    const useTheme = createScopedState<Prefs>({
      scope: memoryScope,
      key: "prefs",
      initial: { theme: "light" },
    })
    function Label(): ReactNode {
      const theme = useTheme((prefs) => prefs.theme)
      return `theme: ${theme}`
    }
    const html = renderToString(
      <useTheme.Provider initialValue={{ theme: "dark" }}>
        <Label />
      </useTheme.Provider>,
    )
    expect(html).toContain("theme: dark")
  })

  test("two Providers in one process stay isolated — no cross-request leak", () => {
    const useTheme = createScopedState<Prefs>({
      scope: memoryScope,
      key: "prefs",
      initial: { theme: "light" },
    })
    function Label(): ReactNode {
      const theme = useTheme((prefs) => prefs.theme)
      return `theme: ${theme}`
    }
    const a = renderToString(
      <useTheme.Provider initialValue={{ theme: "alpha" }}>
        <Label />
      </useTheme.Provider>,
    )
    const b = renderToString(
      <useTheme.Provider initialValue={{ theme: "beta" }}>
        <Label />
      </useTheme.Provider>,
    )
    expect(a).toContain("theme: alpha")
    expect(b).toContain("theme: beta")
  })

  test("the reconciling effect never runs on the server, so a gated backend never blocks", () => {
    const source = fakeStateSource<Prefs>({ initial: { theme: "stored" } })
    const useTheme = createScopedState<Prefs>({
      scope: scopeOf(source),
      key: "prefs",
      initial: { theme: "light" },
    })
    function Label(): ReactNode {
      const theme = useTheme((prefs) => prefs.theme)
      return `theme: ${theme}`
    }
    const html = renderToString(
      <useTheme.Provider>
        <Label />
      </useTheme.Provider>,
    )
    // Server render shows the seed, not the backend value (the effect is client-only).
    expect(html).toContain("theme: light")
    expect(source.subscriberCount).toBe(0)
  })

  test("a host-backed scope renders on the server — source construction touches no host", () => {
    // persistent/cookie/url scopes throw the moment they resolve their host; the server render must
    // build their source without resolving one, or the seed-first SSR guarantee is a lie.
    for (const scope of [persistentScope, sessionScope, cookieScope, urlScope]) {
      const useTheme = createScopedState<string>({ scope, key: "theme", initial: "light" })
      function Label(): ReactNode {
        return `theme: ${useTheme()}`
      }
      const html = renderToString(
        <useTheme.Provider>
          <Label />
        </useTheme.Provider>,
      )
      expect(html).toContain("theme: light")
    }
  })
})
