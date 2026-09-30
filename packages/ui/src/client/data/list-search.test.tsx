// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { ListSearch } from "./list-search"

afterEach(cleanup)

function Harness({ onSearch }: { readonly onSearch: (term: string) => void }) {
  const [term, setTerm] = useState("")
  return (
    <main>
      <ListSearch
        value={term}
        onChange={(next) => {
          setTerm(next)
          onSearch(next)
        }}
        labels={{ label: "Search orders", placeholder: "Customer or ID" }}
      />
    </main>
  )
}

describe("ListSearch", () => {
  it("is a labelled search box that reports every edit", async () => {
    const terms: string[] = []
    const user = userEvent.setup()
    render(<Harness onSearch={(term) => terms.push(term)} />)
    const box = screen.getByRole("searchbox", { name: "Search orders" })
    expect(box.getAttribute("placeholder")).toBe("Customer or ID")
    await user.type(box, "ada")
    expect(terms).toEqual(["a", "ad", "ada"])
    await expectNoAxeViolations(document.body)
  })

  it("falls back to a default label", () => {
    render(<ListSearch value="" onChange={() => {}} />)
    expect(screen.getByRole("searchbox", { name: "Search" })).toBeDefined()
  })
})
