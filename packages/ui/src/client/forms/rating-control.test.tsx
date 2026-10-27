// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  pairwiseRating,
  pointsRating,
  RatingControl,
  type RatingOption,
  thumbsRating,
} from "./rating-control"

afterEach(cleanup)

function Rated<T extends string>({
  options,
  onRate,
  globalKeys,
  singleKeys,
  initial,
}: {
  options: readonly RatingOption<T>[]
  onRate: (value: T) => void
  globalKeys?: boolean
  singleKeys?: boolean
  initial?: T
}) {
  const [value, setValue] = useState<T | undefined>(initial)
  return (
    <>
      <input aria-label="Notes" />
      <RatingControl
        label="Rate this answer"
        options={options}
        value={value}
        onValueChange={(next) => {
          setValue(next)
          onRate(next)
        }}
        {...(globalKeys === undefined ? {} : { globalKeys })}
        {...(singleKeys === undefined ? {} : { singleKeys })}
      />
    </>
  )
}

const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed")

describe("RatingControl", () => {
  it("names each choice, shows and announces its key, and passes axe", async () => {
    const { container } = render(<Rated options={thumbsRating()} onRate={() => undefined} />)
    expect(screen.getByRole("group", { name: "Rate this answer" })).toBeDefined()
    const up = screen.getByRole("button", { name: "Good" })
    expect(up.getAttribute("aria-keyshortcuts")).toBe("U")
    expect(up.querySelector('[data-slot="kbd"]')?.textContent).toBe("U")
    expect(pressed("Bad")).toBe("false")
    await expectNoAxeViolations(container)
  })

  it("names each choice by its content, so the name holds the visible text, even with the label hidden", () => {
    const hidden = thumbsRating().map((option) => ({ ...option, hideLabel: true }))
    render(<Rated options={hidden} onRate={() => undefined} />)
    for (const name of ["Bad", "Good"]) {
      const button = screen.getByRole("button", { name })
      expect(button.hasAttribute("aria-label")).toBe(false)
      expect(button.querySelector(".sr-only")?.textContent).toBe(name)
    }
  })

  it("picks by click, keeps the value on a second press, and always reports the pick", async () => {
    const onRate = vi.fn()
    const user = userEvent.setup()
    render(<Rated options={thumbsRating()} onRate={onRate} />)
    await user.click(screen.getByRole("button", { name: "Good" }))
    await user.click(screen.getByRole("button", { name: "Good" }))
    expect(onRate.mock.calls).toEqual([["up"], ["up"]])
    expect(pressed("Good")).toBe("true")
  })

  it("picks with a choice key while focus is in the group, and moves with arrows", async () => {
    const onRate = vi.fn()
    const user = userEvent.setup()
    render(<Rated options={pointsRating()} onRate={onRate} />)
    await user.keyboard("3")
    expect(onRate).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "1 of 5" }))
    await user.keyboard("{ArrowRight}")
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "2 of 5" }))
    await user.keyboard("4")
    expect(onRate.mock.calls).toEqual([["1"], ["4"]])
    expect(pressed("4 of 5")).toBe("true")
  })

  it("listens page-wide with globalKeys but never while typing in a field", async () => {
    const onRate = vi.fn()
    const user = userEvent.setup()
    render(<Rated options={pairwiseRating()} onRate={onRate} globalKeys />)
    await user.keyboard("e")
    await user.click(screen.getByRole("textbox", { name: "Notes" }))
    await user.keyboard("b")
    expect(onRate.mock.calls).toEqual([["equal"]])
    expect(pressed("Equal")).toBe("true")
  })

  it("turns the keys and their hints off with singleKeys false", async () => {
    const onRate = vi.fn()
    const user = userEvent.setup()
    const { container } = render(
      <Rated options={pairwiseRating()} onRate={onRate} globalKeys singleKeys={false} />,
    )
    await user.keyboard("a")
    await user.click(screen.getByRole("button", { name: "B is better" }))
    await user.keyboard("a")
    expect(onRate.mock.calls).toEqual([["b"]])
    expect(container.querySelector('[data-slot="kbd"]')).toBeNull()
    expect(
      screen.getByRole("button", { name: "A is better" }).hasAttribute("aria-keyshortcuts"),
    ).toBe(false)
  })

  it("ignores keys and clicks while disabled", async () => {
    const onRate = vi.fn()
    const user = userEvent.setup()
    render(
      <RatingControl
        label="Rate"
        options={thumbsRating()}
        value="up"
        onValueChange={onRate}
        globalKeys
        disabled
      />,
    )
    await user.keyboard("d")
    await user.click(screen.getByRole("button", { name: "Bad" }))
    expect(onRate).not.toHaveBeenCalled()
  })

  it("refuses an unusable scale", () => {
    expect(() => pointsRating(1)).toThrow(RangeError)
    expect(() => pointsRating(10)).toThrow(RangeError)
    expect(() => pointsRating(2.5)).toThrow(RangeError)
    expect(pointsRating(3).map((o) => o.label)).toEqual(["1 of 3", "2 of 3", "3 of 3"])
    const clash = [
      { value: "x", label: "X", key: "a" },
      { value: "y", label: "Y", key: "A" },
    ]
    expect(() =>
      render(
        <RatingControl label="R" options={clash} value={undefined} onValueChange={() => {}} />,
      ),
    ).toThrow(/repeats/)
    const long = [{ value: "x", label: "X", key: "ab" }]
    expect(() =>
      render(<RatingControl label="R" options={long} value={undefined} onValueChange={() => {}} />),
    ).toThrow(/one-character/)
  })
})
