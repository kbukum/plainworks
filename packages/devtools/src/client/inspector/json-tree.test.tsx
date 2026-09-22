// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { JsonTree } from "./json-tree"

afterEach(cleanup)

describe("JsonTree", () => {
  it("renders scalar leaves with their keys", () => {
    render(<JsonTree value={{ method: "GET", status: 200, cached: false, error: null }} />)
    expect(screen.getByText("method")).toBeTruthy()
    expect(screen.getByText('"GET"')).toBeTruthy()
    expect(screen.getByText("200")).toBeTruthy()
    expect(screen.getByText("false")).toBeTruthy()
    expect(screen.getByText("null")).toBeTruthy()
  })

  it("nests objects and arrays behind disclosures", async () => {
    const user = userEvent.setup()
    render(<JsonTree value={{ headers: { accept: "json" }, tags: ["a", "b"] }} />)
    expect(screen.getByText("headers")).toBeTruthy()
    expect(screen.getByText("accept")).toBeTruthy()
    const tags = screen.getByRole("button", { name: /tags/ })
    await user.click(tags)
    expect(tags.getAttribute("aria-expanded")).toBe("false")
  })

  it("renders top-level scalars and empty collections", () => {
    const { rerender } = render(<JsonTree value="plain" />)
    expect(screen.getByText('"plain"')).toBeTruthy()
    rerender(<JsonTree value={{}} />)
    expect(screen.getByText(/\{\}/)).toBeTruthy()
    rerender(<JsonTree value={[]} />)
    expect(screen.getByText(/\[\]/)).toBeTruthy()
  })

  it("passes axe on a nested structure", async () => {
    const { container } = render(
      <JsonTree value={{ request: { url: "/tasks", retry: { attempts: 2, ok: true } } }} />,
    )
    await expectNoAxeViolations(container)
  })
})
