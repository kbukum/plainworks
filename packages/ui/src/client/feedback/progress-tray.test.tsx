// @vitest-environment jsdom

import { expectNoAxeViolations, installLayoutApis } from "@plainworks/testkit/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { ProgressTray, type TrayTask } from "./progress-tray"

beforeAll(installLayoutApis)
afterEach(cleanup)

const TASKS: readonly TrayTask[] = [
  { id: "a", title: "qwen3 Small", detail: "1.1 of 2.5 GB", progress: 44, state: "running" },
  { id: "b", title: "smollm2 Tiny", state: "running" },
  { id: "c", title: "gemma3 Small", detail: "Ready to use", state: "done" },
  { id: "d", title: "phi4 Medium", detail: "The machine ran out of disk", state: "failed" },
]

describe("ProgressTray", () => {
  it("counts running tasks on its button and lists every task with its progress", async () => {
    const user = userEvent.setup()
    const { baseElement } = render(
      <ProgressTray
        label="Downloads"
        tasks={TASKS}
        onCancel={() => undefined}
        onDismiss={() => undefined}
      />,
    )
    const button = screen.getByRole("button", { name: "Downloads, 2 running" })
    expect(button.textContent).toContain("2")
    await user.click(button)
    const list = await screen.findByRole("list", { name: "Downloads" })
    const items = within(list).getAllByRole("listitem")
    expect(
      items.map((i) => i.querySelector("[data-slot=progress-tray-title]")?.textContent),
    ).toEqual(["qwen3 Small", "smollm2 Tiny", "gemma3 Small", "phi4 Medium"])
    const bar = within(items[0] as HTMLElement).getByRole("progressbar", { name: "qwen3 Small" })
    expect(bar.getAttribute("aria-valuenow")).toBe("44")
    // A task with no known progress is still running, with no made-up number.
    expect(within(items[1] as HTMLElement).queryByRole("progressbar")).toBeNull()
    expect(within(items[1] as HTMLElement).getByText("Running")).toBeDefined()
    expect(within(items[3] as HTMLElement).getByText("The machine ran out of disk")).toBeDefined()
    expect(within(items[3] as HTMLElement).getByText("Failed")).toBeDefined()
    await expectNoAxeViolations(baseElement)
  })

  it("cancels a running task and dismisses a finished one", async () => {
    const onCancel = vi.fn()
    const onDismiss = vi.fn()
    const user = userEvent.setup()
    render(
      <ProgressTray label="Downloads" tasks={TASKS} onCancel={onCancel} onDismiss={onDismiss} />,
    )
    await user.click(screen.getByRole("button", { name: "Downloads, 2 running" }))
    await user.click(await screen.findByRole("button", { name: "Cancel qwen3 Small" }))
    expect(onCancel).toHaveBeenCalledWith("a")
    expect(screen.queryByRole("button", { name: "Cancel gemma3 Small" })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Dismiss gemma3 Small" }))
    expect(onDismiss).toHaveBeenCalledWith("c")
  })

  it("announces when a task finishes, and says when there is nothing to show", async () => {
    const user = userEvent.setup()
    const running: TrayTask = { id: "a", title: "qwen3 Small", state: "running" }
    const { rerender } = render(<ProgressTray label="Downloads" tasks={[running]} />)
    const status = screen.getByRole("status")
    expect(status.textContent).toBe("")
    rerender(<ProgressTray label="Downloads" tasks={[{ ...running, state: "done" }]} />)
    expect(status.textContent).toBe("qwen3 Small: Done")
    rerender(
      <ProgressTray label="Downloads" tasks={[]} labels={{ empty: "Nothing downloading." }} />,
    )
    const button = screen.getByRole("button", { name: "Downloads" })
    await user.click(button)
    expect(await screen.findByText("Nothing downloading.")).toBeDefined()
  })
})
