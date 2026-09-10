// @vitest-environment jsdom
import { createQueryClient } from "@plainworks/query"
import { useQueryClient } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { AppProvider } from "../client/provider"
import { createQueryCapability } from "./query"

afterEach(cleanup)

function ReadsClient({ expected }: { expected: unknown }): ReactNode {
  return createElement("p", null, useQueryClient() === expected ? "same-client" : "other")
}

describe("createQueryCapability", () => {
  it("mounts the caller-owned client so the subtree reads exactly it", () => {
    const client = createQueryClient()
    render(
      <AppProvider capabilities={[createQueryCapability({ client })]}>
        <ReadsClient expected={client} />
      </AppProvider>,
    )
    expect(screen.getByText("same-client")).toBeDefined()
  })

  it("declares its id and dependencies so the ordering graph can target it", () => {
    const client = createQueryClient()
    const capability = createQueryCapability({ client, id: "data", dependsOn: ["telemetry"] })
    expect(capability.id).toBe("data")
    expect(capability.dependsOn).toEqual(["telemetry"])
  })
})
