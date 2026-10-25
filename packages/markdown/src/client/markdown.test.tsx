// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Markdown } from "./markdown"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("Markdown", () => {
  it("renders GitHub-flavored Markdown without breaking the page outline", async () => {
    const source = [
      "# Title",
      "",
      "Some **bold** and ~~old~~ text with `code`.",
      "",
      "- [x] done",
      "- [ ] open",
      "",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
    ].join("\n")
    const { container } = render(<Markdown>{source}</Markdown>)
    expect(screen.getByRole("heading", { level: 3, name: "Title" })).toBeDefined()
    expect(container.querySelector("strong")?.textContent).toBe("bold")
    expect(container.querySelector("del")?.textContent).toBe("old")
    expect(screen.getByRole("table")).toBeDefined()
    expect(container.querySelector("input")).toBeNull()
    expect(container.textContent).toContain("Done")
    expect(container.textContent).toContain("Not done")
    await expectNoAxeViolations(container)
  })

  it("shifts headings below the page and keeps lists, quotes and rules", () => {
    const source =
      "## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six\n\n3. three\n4. four\n\n> quoted\n\n---"
    const { container } = render(<Markdown>{source}</Markdown>)
    expect(screen.getAllByRole("heading").map((h) => h.tagName)).toEqual(["H4", "H5", "H6"])
    expect(container.textContent).toContain("Five")
    expect(container.textContent).toContain("Six")
    expect(container.querySelector("ol")?.getAttribute("start")).toBe("3")
    expect(container.querySelector("blockquote")?.textContent?.trim()).toBe("quoted")
    expect(container.querySelector("hr")).not.toBeNull()
  })

  it("drops raw HTML", () => {
    const { container } = render(
      <Markdown>
        {'<script>alert(1)</script>\n\nSome <img src=x onerror="alert(1)"><b>inline</b> text'}
      </Markdown>,
    )
    expect(container.querySelector("script, img, b, [onerror]")).toBeNull()
    expect(container.textContent?.trim()).toBe("Some inline text")
  })

  it("keeps safe links and turns unsafe ones into text", () => {
    const { container } = render(
      <Markdown>
        {
          "[ok](https://example.com) [bad](javascript:alert(1)) [rel](/admin) <https://auto.example>"
        }
      </Markdown>,
    )
    const links = screen.getAllByRole("link")
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://example.com",
      "https://auto.example",
    ])
    expect(links[0]?.getAttribute("rel")).toBe("noopener noreferrer nofollow ugc")
    expect(container.textContent).toContain("bad")
    expect(container.textContent).toContain("rel")
    expect(container.querySelector('[href^="javascript"], [href="/admin"]')).toBeNull()
  })

  it("never loads images", () => {
    const { container } = render(
      <Markdown>{"![a cat](https://img.example/cat.png) ![x](javascript:alert(1))"}</Markdown>,
    )
    expect(container.querySelector("img")).toBeNull()
    expect(screen.getByRole("link", { name: "Image: a cat" }).getAttribute("href")).toBe(
      "https://img.example/cat.png",
    )
    expect(screen.getByText("Image: x").tagName).toBe("SPAN")
  })

  it("labels a code block and copies its text", async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue()
    const { container } = render(
      <Markdown>{"```go\nfmt.Println(1)\n```\n\n```\nplain\n```"}</Markdown>,
    )
    expect(container.querySelector("pre")?.textContent).toBe("fmt.Println(1)")
    await user.click(screen.getByRole("button", { name: "Copy go" }))
    expect(writeText).toHaveBeenCalledWith("fmt.Println(1)")
    expect(screen.getByRole("button", { name: "Copy Code" })).toBeDefined()
    await expectNoAxeViolations(container)
  })

  it("cuts source past the bound with a note", () => {
    const { container } = render(
      <Markdown maxLength={5} labels={{ truncated: "Gekürzt." }}>
        {"abcdefghij"}
      </Markdown>,
    )
    expect(container.textContent).toBe("abcdeGekürzt.")
  })
})
