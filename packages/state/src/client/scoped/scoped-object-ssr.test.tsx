// Default `node` environment: proves composite hydration renders per-field seeds on the server with
// no host and that two concurrent requests never share state.

import { fakeStateSource } from "@plainworks/testkit"
import type { ReactNode } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import type { Scope, SourceSpec } from "../../scope/scope"
import { createScopedObject } from "./scoped-object"

interface Prefs {
  theme: string
  sidebar: string
}

function memoryLikeScope(name: string): Scope {
  const source = fakeStateSource<unknown>()
  return {
    name,
    capabilities: source.capabilities,
    createSource: <Value,>(_spec: SourceSpec<Value>) => fakeStateSource<Value>(),
  }
}

describe("createScopedObject — server rendering", () => {
  test("renders each field's seed on the server without touching a host", () => {
    const usePrefs = createScopedObject<Prefs>({
      fields: {
        theme: { scope: memoryLikeScope("cookie"), initial: "system" },
        sidebar: { scope: memoryLikeScope("persistent"), initial: "open" },
      },
    })
    function View(): ReactNode {
      const theme = usePrefs((s) => s.theme)
      const sidebar = usePrefs((s) => s.sidebar)
      return `${theme}/${sidebar}`
    }
    const html = renderToString(
      <usePrefs.Provider initialValues={{ theme: "dark" }}>
        <View />
      </usePrefs.Provider>,
    )
    // The seeded field uses the server value; an unseeded field falls back to its initial.
    expect(html).toContain("dark/open")
  })

  test("two Providers in one process stay isolated — no cross-request leak", () => {
    const usePrefs = createScopedObject<Prefs>({
      fields: {
        theme: { scope: memoryLikeScope("cookie"), initial: "system" },
        sidebar: { scope: memoryLikeScope("persistent"), initial: "open" },
      },
    })
    function View(): ReactNode {
      const theme = usePrefs((s) => s.theme)
      return `theme: ${theme}`
    }
    const a = renderToString(
      <usePrefs.Provider initialValues={{ theme: "alpha" }}>
        <View />
      </usePrefs.Provider>,
    )
    const b = renderToString(
      <usePrefs.Provider initialValues={{ theme: "beta" }}>
        <View />
      </usePrefs.Provider>,
    )
    expect(a).toContain("theme: alpha")
    expect(b).toContain("theme: beta")
  })
})
