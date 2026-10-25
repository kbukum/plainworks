// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/shadcn/combobox"

afterEach(cleanup)
Element.prototype.scrollIntoView = vi.fn()

const fruits = ["Apple", "Banana", "Cherry"]

function Single() {
  return (
    <main>
      <Combobox items={fruits}>
        <ComboboxInput aria-label="Fruit" showTrigger={false} />
        <ComboboxContent role="region" aria-label="Fruit options">
          <ComboboxEmpty>No fruit</ComboboxEmpty>
          <ComboboxList>
            {(item: string) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </main>
  )
}

describe("Combobox", () => {
  it("filters the list as the user types and picks with the keyboard", async () => {
    const user = userEvent.setup()
    render(<Single />)
    const input = screen.getByRole("combobox", { name: "Fruit" })
    await user.type(input, "ban")
    expect(await screen.findByRole("option", { name: "Banana" })).toBeTruthy()
    expect(screen.queryByRole("option", { name: "Apple" })).toBeNull()
    await expectNoAxeViolations(document.body)
    await user.keyboard("{ArrowDown}{Enter}")
    expect((input as HTMLInputElement).value).toBe("Banana")
  })

  // Upstream gaps the ui ComboboxField works around: the default trigger and a chip's remove
  // button render without an accessible name. A registry update that names them fails this test,
  // so the wrapper's workaround can be dropped.
  it("leaves the trigger and chip remove buttons unnamed", () => {
    render(
      <main>
        <Combobox items={fruits}>
          <ComboboxInput aria-label="Fruit" />
        </Combobox>
        <Combobox items={fruits} multiple defaultValue={["Apple"]}>
          <ComboboxChips>
            <ComboboxChip>Apple</ComboboxChip>
            <ComboboxChipsInput aria-label="Fruits" />
          </ComboboxChips>
        </Combobox>
      </main>,
    )
    const unnamed = screen.getAllByRole("button").filter((b) => b.textContent?.trim() === "")
    expect(unnamed.map((b) => b.getAttribute("aria-label"))).toEqual([null, null])
  })
})
