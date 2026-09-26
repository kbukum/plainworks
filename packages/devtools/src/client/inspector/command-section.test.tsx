// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { CommandDescriptor, SourceId } from "../../protocol"
import { createDevtoolsSession, type DevtoolsClientPort } from "../../session"
import { fakeSource } from "../../testing/fake-source"
import { CommandSection } from "./command-section"

const mocks: SourceId = { kind: "mocks", instance: "demo" }

afterEach(cleanup)

function setup(commands: readonly CommandDescriptor[], runCommand?: (id: string) => unknown) {
  const session = createDevtoolsSession()
  session.registerSource(
    fakeSource(mocks, {
      label: "Mocks demo",
      commands,
      ...(runCommand === undefined ? {} : { runCommand }),
    }),
  )
  return { session, port: session.connect() }
}

function renderSection(port: DevtoolsClientPort, commands: readonly CommandDescriptor[]) {
  return render(
    <CommandSection port={port} source={{ id: mocks, label: "Mocks demo", commands }} />,
  )
}

describe("CommandSection", () => {
  it("renders nothing when the source advertises no commands", () => {
    const { port } = setup([])
    const { container } = renderSection(port, [])
    expect(container.firstChild).toBeNull()
  })

  it("runs a safe command and reports the result", async () => {
    const user = userEvent.setup()
    const runCommand = vi.fn(() => ({ cleared: 4 }))
    const { port } = setup(
      [{ id: "clear", label: "Clear log", risk: "safe", available: true }],
      runCommand,
    )
    renderSection(port, [{ id: "clear", label: "Clear log", risk: "safe", available: true }])
    await user.click(screen.getByRole("button", { name: "Clear log" }))
    expect(runCommand).toHaveBeenCalledWith("clear", null, expect.any(Object))
    const status = await screen.findByRole("status")
    expect(status.textContent).toContain("cleared")
  })

  it("announces a command failure", async () => {
    const user = userEvent.setup()
    const { port } = setup([{ id: "boom", label: "Boom", risk: "safe", available: true }], () => {
      throw new Error("control plane offline")
    })
    renderSection(port, [{ id: "boom", label: "Boom", risk: "safe", available: true }])
    await user.click(screen.getByRole("button", { name: "Boom" }))
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("control plane offline")
  })

  it("disables an unavailable command", () => {
    const { port } = setup([{ id: "x", label: "Disabled", risk: "safe", available: false }])
    renderSection(port, [{ id: "x", label: "Disabled", risk: "safe", available: false }])
    expect(screen.getByRole("button", { name: "Disabled" })).toHaveProperty("disabled", true)
  })

  it("marks mutating commands visibly", () => {
    const { port } = setup([
      { id: "latency", label: "Set latency", risk: "mutating", available: true },
    ])
    renderSection(port, [
      { id: "latency", label: "Set latency", risk: "mutating", available: true },
    ])
    expect(screen.getByText("Mutates state")).toBeTruthy()
  })

  it("runs a destructive command only after an inline confirmation", async () => {
    const user = userEvent.setup()
    const runCommand = vi.fn(() => "done")
    const reset: CommandDescriptor = {
      id: "reset",
      label: "Reset data",
      risk: "destructive",
      available: true,
    }
    const { port } = setup([reset], runCommand)
    renderSection(port, [reset])
    await user.click(screen.getByRole("button", { name: "Reset data" }))
    expect(runCommand).not.toHaveBeenCalled()
    expect(screen.queryByRole("alertdialog")).toBeNull()
    const confirmation = screen.getByRole("group", { name: "Confirm Reset data" })
    expect(confirmation.textContent).toContain("cannot be undone")
    // The safe choice takes focus, so a stray Enter never runs the destructive command.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }))
    await user.click(screen.getByRole("button", { name: "Confirm Reset data" }))
    expect(runCommand).toHaveBeenCalledWith("reset", null, expect.any(Object))
    expect(await screen.findByRole("status")).toBeTruthy()
    expect(screen.queryByRole("group", { name: "Confirm Reset data" })).toBeNull()
  })

  it("keeps focus in the command section after confirming, while the command is pending", async () => {
    const user = userEvent.setup()
    const reset: CommandDescriptor = {
      id: "reset",
      label: "Reset data",
      risk: "destructive",
      available: true,
    }
    const { port } = setup([reset], () => new Promise(() => {}))
    renderSection(port, [reset])
    await user.click(screen.getByRole("button", { name: "Reset data" }))
    await user.click(screen.getByRole("button", { name: "Confirm Reset data" }))
    // The trigger is disabled while the run is pending, so focus lands on its section instead
    // of falling back to the document body.
    expect(screen.getByRole("button", { name: "Reset data" })).toHaveProperty("disabled", true)
    expect(document.activeElement).toBe(screen.getByRole("region", { name: "Mocks demo commands" }))
  })

  it("cancels a destructive confirmation and returns focus to the command", async () => {
    const user = userEvent.setup()
    const runCommand = vi.fn(() => "done")
    const reset: CommandDescriptor = {
      id: "reset",
      label: "Reset data",
      risk: "destructive",
      available: true,
    }
    const { port } = setup([reset], runCommand)
    renderSection(port, [reset])
    await user.click(screen.getByRole("button", { name: "Reset data" }))
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("group", { name: "Confirm Reset data" })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Reset data" }))

    await user.click(screen.getByRole("button", { name: "Reset data" }))
    // Escape is consumed (default prevented) by the confirmation, so it does not also close the
    // inspector around it.
    expect(
      fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), { key: "Escape" }),
    ).toBe(false)
    await screen.findByRole("button", { name: "Reset data" })
    expect(screen.queryByRole("group", { name: "Confirm Reset data" })).toBeNull()
    expect(runCommand).not.toHaveBeenCalled()
  })

  it("tracks pending state per command independently during concurrent runs", async () => {
    const user = userEvent.setup()
    let resolveA: () => void = () => {}
    const runA = new Promise((resolve) => {
      resolveA = () => resolve("done-a")
    })
    const runCommand = vi.fn((id: string) => (id === "a" ? runA : Promise.resolve("done-b")))
    const commands: readonly CommandDescriptor[] = [
      { id: "a", label: "Cmd A", risk: "safe", available: true },
      { id: "b", label: "Cmd B", risk: "safe", available: true },
    ]
    const { port } = setup(commands, runCommand)
    renderSection(port, commands)

    await user.click(screen.getByRole("button", { name: "Cmd A" }))
    expect(screen.getByRole("button", { name: "Cmd A" })).toHaveProperty("disabled", true)
    expect(screen.getByRole("button", { name: "Cmd B" })).toHaveProperty("disabled", false)

    await user.click(screen.getByRole("button", { name: "Cmd B" }))
    // Even after B settles, A remains pending and disabled until A settles
    await screen.findByRole("status")
    expect(screen.getByRole("button", { name: "Cmd A" })).toHaveProperty("disabled", true)

    resolveA()
    await screen.findByText(/Cmd A: "done-a"/)
    expect(screen.getByRole("button", { name: "Cmd A" })).toHaveProperty("disabled", false)
  })

  it("aborts in-flight commands and clears pending/outcome when source changes", async () => {
    const user = userEvent.setup()
    let aborted = false
    const session = createDevtoolsSession()
    session.registerSource(
      fakeSource(mocks, {
        label: "Mocks demo",
        commands: [{ id: "a", label: "Cmd A", risk: "safe", available: true }],
        runCommand: (_id, _input, signal) =>
          new Promise((resolve) => {
            signal?.addEventListener("abort", () => {
              aborted = true
              resolve("aborted")
            })
          }),
      }),
    )
    const port = session.connect()
    const { rerender } = render(
      <CommandSection
        port={port}
        source={{
          id: mocks,
          label: "Mocks demo",
          commands: [{ id: "a", label: "Cmd A", risk: "safe", available: true }],
        }}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Cmd A" }))
    expect(screen.getByRole("button", { name: "Cmd A" })).toHaveProperty("disabled", true)

    const otherSource: SourceId = { kind: "mocks", instance: "other" }
    rerender(
      <CommandSection
        port={port}
        source={{
          id: otherSource,
          label: "Mocks other",
          commands: [{ id: "a", label: "Cmd A", risk: "safe", available: true }],
        }}
      />,
    )

    expect(aborted).toBe(true)
    expect(screen.getByRole("button", { name: "Cmd A" })).toHaveProperty("disabled", false)
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("passes axe with every risk level shown", async () => {
    const commands: readonly CommandDescriptor[] = [
      { id: "a", label: "Refresh", risk: "safe", available: true },
      { id: "b", label: "Tune", risk: "mutating", available: true },
      { id: "c", label: "Wipe", risk: "destructive", available: true },
    ]
    const { port } = setup(commands)
    const { container } = renderSection(port, commands)
    await expectNoAxeViolations(container)
  })
})
