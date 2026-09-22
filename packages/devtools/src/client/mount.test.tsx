// @vitest-environment jsdom

import { act, cleanup, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { createDevtoolsSession } from "../session"
import { fakeSource } from "../testing/fake-source"
import { mountDevtools } from "./mount"

afterEach(cleanup)

describe("mountDevtools", () => {
  it("mounts the shell into its own root and tears it down completely", async () => {
    const session = createDevtoolsSession()
    session.registerSource(fakeSource({ kind: "http", instance: "api" }))
    let unmount: () => void = () => {}
    act(() => {
      unmount = mountDevtools({ session, tickMs: 0 })
    })
    expect(await screen.findByRole("button", { name: "Open Plainworks inspector" })).toBeTruthy()
    expect(document.querySelector("[data-plainworks-devtools]")).not.toBeNull()

    act(() => unmount())
    expect(screen.queryByRole("button", { name: "Open Plainworks inspector" })).toBeNull()
    expect(document.querySelector("[data-plainworks-devtools]")).toBeNull()
  })

  it("mounts into a caller-provided container and is repeatable", async () => {
    const container = document.createElement("aside")
    document.body.append(container)
    const session = createDevtoolsSession()
    let first: () => void = () => {}
    act(() => {
      first = mountDevtools({ session, container, tickMs: 0 })
    })
    act(() => first())
    let second: () => void = () => {}
    act(() => {
      second = mountDevtools({ session, container, tickMs: 0 })
    })
    expect(await screen.findByRole("button", { name: "Open Plainworks inspector" })).toBeTruthy()
    act(() => second())
    container.remove()
  })
})
