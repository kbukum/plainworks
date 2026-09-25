// @vitest-environment jsdom

import { act, cleanup, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { DuplicateSourceError } from "../session"
import { fakeSource } from "../testing/fake-source"
import { type DevtoolsMount, type MountDevtoolsOptions, mountDevtools } from "./mount"

afterEach(cleanup)

const LAUNCHER = "Open Plainworks inspector"

/** Mount inside `act` with the clock frozen, so a test never races the rail's freshness tick. */
function mount(options: MountDevtoolsOptions = {}): DevtoolsMount {
  let handle: DevtoolsMount | undefined
  act(() => {
    handle = mountDevtools({ tickMs: 0, ...options })
  })
  if (handle === undefined) throw new Error("mountDevtools did not return a mount")
  return handle
}

describe("mountDevtools", () => {
  it("registers its sources and tears down the shell and the session it owns", async () => {
    const source = fakeSource({ kind: "http", instance: "api" })
    const handle = mount({ sources: [source] })

    expect(await screen.findByRole("button", { name: LAUNCHER })).toBeTruthy()
    expect(document.querySelector("[data-plainworks-devtools]")).not.toBeNull()
    expect(handle.session.connect().snapshot().sources).toHaveLength(1)

    act(() => handle.dispose())
    expect(screen.queryByRole("button", { name: LAUNCHER })).toBeNull()
    expect(document.querySelector("[data-plainworks-devtools]")).toBeNull()
    expect(source.disposed).toBe(true)
  })

  it("is idempotent, so a host may dispose from more than one lifecycle", () => {
    const handle = mount()
    act(() => {
      handle.dispose()
      handle.dispose()
    })
    expect(document.querySelector("[data-plainworks-devtools]")).toBeNull()
  })

  it("exposes its session so a host can register a source discovered after mount", async () => {
    const handle = mount()
    const late = fakeSource({ kind: "query", instance: "app" })
    act(() => {
      handle.session.registerSource(late)
    })

    expect(await screen.findByRole("button", { name: LAUNCHER })).toBeTruthy()
    act(() => handle.dispose())
    expect(late.disposed).toBe(true)
  })

  it("leaves no session or DOM behind when a source fails to register", () => {
    const duplicate = { kind: "http", instance: "api" } as const
    expect(() =>
      mountDevtools({ sources: [fakeSource(duplicate), fakeSource(duplicate)], tickMs: 0 }),
    ).toThrow(DuplicateSourceError)
    expect(document.querySelector("[data-plainworks-devtools]")).toBeNull()
  })

  it("mounts into a caller-provided container and is repeatable", async () => {
    const container = document.createElement("aside")
    document.body.append(container)

    const first = mount({ container })
    act(() => first.dispose())
    const second = mount({ container })

    expect(await screen.findByRole("button", { name: LAUNCHER })).toBeTruthy()
    act(() => second.dispose())
    container.remove()
  })
})
