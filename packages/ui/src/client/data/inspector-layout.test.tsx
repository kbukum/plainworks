// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { InspectorLayout } from "./inspector-layout"

afterEach(cleanup)

const models = ["llama", "gemma", "qwen"]

function Harness({ initial = null }: { readonly initial?: string | null }) {
  const [openId, setOpenId] = useState<string | null>(initial)
  return (
    <main>
      <InspectorLayout
        items={models}
        openId={openId}
        onOpenChange={setOpenId}
        title={openId}
        list={
          <ul>
            {models.map((id) => (
              <li key={id}>
                <button type="button" data-inspector-item={id} onClick={() => setOpenId(id)}>
                  Open {id}
                </button>
              </li>
            ))}
          </ul>
        }
      >
        <label>
          Note <input />
        </label>
      </InspectorLayout>
    </main>
  )
}

describe("InspectorLayout", () => {
  it("renders only the list while closed", () => {
    render(<Harness />)
    expect(screen.queryByRole("complementary")).toBeNull()
  })

  it("opens a labelled pane, focuses its heading, and has no violations", async () => {
    const user = userEvent.setup()
    const { container } = render(<Harness />)
    await user.click(screen.getByRole("button", { name: "Open gemma" }))
    const pane = screen.getByRole("complementary", { name: "gemma" })
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "gemma" }))
    expect(pane.textContent).toContain("2 of 3")
    await expectNoAxeViolations(container)
  })

  it("steps with buttons and arrow keys, stopping at the ends", async () => {
    const user = userEvent.setup()
    render(<Harness initial="llama" />)
    expect(screen.getByRole("button", { name: "Previous" }).getAttribute("aria-disabled")).toBe(
      "true",
    )
    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(screen.getByRole("heading").textContent).toBe("gemma")
    await user.keyboard("{ArrowRight}")
    expect(screen.getByRole("heading").textContent).toBe("qwen")
    await user.keyboard("{ArrowRight}")
    expect(screen.getByRole("heading").textContent).toBe("qwen")
    await user.keyboard("{ArrowLeft}")
    expect(screen.getByRole("heading").textContent).toBe("gemma")
  })

  it("leaves arrow keys to text inputs", async () => {
    const user = userEvent.setup()
    render(<Harness initial="gemma" />)
    await user.click(screen.getByRole("textbox", { name: "Note" }))
    await user.keyboard("{ArrowRight}")
    expect(screen.getByRole("heading").textContent).toBe("gemma")
  })

  it("closes on Escape and returns focus to the row", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole("button", { name: "Open qwen" }))
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("complementary")).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open qwen" }))
  })

  it("closes from the close button", async () => {
    const user = userEvent.setup()
    render(<Harness initial="llama" />)
    await user.click(screen.getByRole("button", { name: "Close" }))
    expect(screen.queryByRole("complementary")).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open llama" }))
  })
})
