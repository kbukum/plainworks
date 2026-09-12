// @vitest-environment jsdom
import { memoryScope } from "@plainworks/state"
import { cleanup, render, screen } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { AppProvider } from "../client/provider"
import { AppContextError } from "../errors"
import { createScopesCapability } from "./state"

afterEach(cleanup)

describe("createScopesCapability", () => {
  it("publishes the scope registry to the subtree as a capability, not a kernel seam", () => {
    const { capability, useScopes } = createScopesCapability({
      scopes: { memory: memoryScope },
    })

    function Probe(): ReactNode {
      const scopes = useScopes()
      return createElement("p", null, `${"memory" in scopes}:${Object.keys(scopes).length}`)
    }
    render(
      <AppProvider capabilities={[capability]}>
        <Probe />
      </AppProvider>,
    )
    expect(screen.getByText("true:1")).toBeDefined()
  })

  it("fails with a typed error when read outside its provider", () => {
    const { useScopes } = createScopesCapability({ scopes: { memory: memoryScope } })

    function Probe(): ReactNode {
      return createElement("p", null, Object.keys(useScopes()).length)
    }
    expect(() => render(createElement(Probe))).toThrow(AppContextError)
  })

  it("declares its id and dependencies so the ordering graph can target it", () => {
    const { capability } = createScopesCapability({
      scopes: { memory: memoryScope },
      id: "state",
      dependsOn: ["query"],
    })
    expect(capability.id).toBe("state")
    expect(capability.dependsOn).toEqual(["query"])
  })
})
