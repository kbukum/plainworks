// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ComboboxField, type ComboboxOptionGroup, matchesOption } from "./combobox-field"
import { Form } from "./form"
import { FormSubmit } from "./form-submit"

class TestResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = TestResizeObserver
Element.prototype.scrollIntoView = vi.fn()

afterEach(cleanup)

const groups: readonly ComboboxOptionGroup[] = [
  {
    label: "Local",
    options: [
      { value: "llama", label: "llama3.2", description: "llama · 3B", keywords: ["meta"] },
      { value: "qwen", label: "qwen2.5", description: "qwen2 · 7B" },
    ],
  },
  {
    label: "Cloud",
    options: [{ value: "vision", label: "vision-echo", disabledReason: "Takes images, not text" }],
  },
]

describe("matchesOption", () => {
  it("matches the label or a keyword, ignoring case", () => {
    const option = { value: "a", label: "Llama3.2", keywords: ["Meta"] }
    expect(matchesOption(option, "llama")).toBe(true)
    expect(matchesOption(option, "meta")).toBe(true)
    expect(matchesOption(option, "  ")).toBe(true)
    expect(matchesOption(option, "qwen")).toBe(false)
  })
})

describe("ComboboxField", () => {
  it("is a labelled combobox that filters grouped options and picks one", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    const { container } = render(
      <ComboboxField name="model" label="Model" options={groups} onValueChange={onValueChange} />,
    )
    const input = screen.getByRole("combobox", { name: "Model" })
    await expectNoAxeViolations(container)

    await user.click(input)
    await user.type(input, "met")
    await waitFor(() => expect(screen.getByRole("option", { name: /llama3\.2/ })).toBeDefined())
    expect(screen.queryByRole("option", { name: /qwen2\.5/ })).toBeNull()
    await user.keyboard("{ArrowDown}{Enter}")
    expect(onValueChange).toHaveBeenLastCalledWith("llama")
  })

  it("shows a disabled option with its reason and does not pick it", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <ComboboxField name="model" label="Model" options={groups} onValueChange={onValueChange} />,
    )
    await user.click(screen.getByRole("combobox", { name: "Model" }))
    const vision = await screen.findByRole("option", { name: /vision-echo/ })
    expect(vision.textContent).toContain("Takes images, not text")
    expect(vision.getAttribute("aria-disabled")).toBe("true")
    expect(screen.getByRole("group", { name: "Cloud" })).toBeDefined()
    await expectNoAxeViolations(screen.getByRole("listbox"))
    await user.click(vision)
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it("shows multiple picks as chips with named remove buttons", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    const { container } = render(
      <ComboboxField
        name="models"
        label="Models"
        multiple
        options={groups}
        defaultValue={["llama", "qwen"]}
        onValueChange={onValueChange}
      />,
    )
    expect(container.textContent).toContain("llama3.2")
    expect(container.textContent).toContain("qwen2.5")
    await expectNoAxeViolations(container)

    const remove = screen.getByRole("button", { name: "Remove qwen2.5" })
    await user.click(remove)
    expect(onValueChange).toHaveBeenLastCalledWith(["llama"])
    expect(screen.queryByRole("button", { name: "Remove qwen2.5" })).toBeNull()
  })

  it("keeps the picks when disabled", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <ComboboxField
        name="models"
        label="Models"
        multiple
        disabled
        options={groups}
        defaultValue={["llama", "qwen"]}
        onValueChange={onValueChange}
      />,
    )
    const remove = screen.getByRole("button", { name: "Remove qwen2.5" })
    expect(remove.hasAttribute("disabled")).toBe(true)
    await user.click(remove)
    expect(onValueChange).not.toHaveBeenCalled()
    expect(screen.getByRole("combobox", { name: "Models" }).hasAttribute("disabled")).toBe(true)
  })

  it("is disabled while its form is pending", async () => {
    const user = userEvent.setup()
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    render(
      <Form onSubmit={() => gate}>
        <ComboboxField
          name="models"
          label="Models"
          multiple
          options={groups}
          defaultValue={["qwen"]}
        />
        <ComboboxField name="model" label="Model" options={groups} />
        <FormSubmit>Save</FormSubmit>
      </Form>,
    )
    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Model" }).hasAttribute("disabled")).toBe(true),
    )
    expect(screen.getByRole("combobox", { name: "Models" }).hasAttribute("disabled")).toBe(true)
    expect(screen.getByRole("button", { name: "Remove qwen2.5" }).hasAttribute("disabled")).toBe(
      true,
    )
    release()
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Model" }).hasAttribute("disabled")).toBe(false),
    )
  })

  it("names the remove buttons and empty text from the labels", async () => {
    const user = userEvent.setup()
    render(
      <ComboboxField
        name="models"
        label="Modelle"
        multiple
        options={groups}
        defaultValue={["llama"]}
        labels={{ empty: "Keine Treffer", remove: (l) => `${l} entfernen` }}
      />,
    )
    expect(screen.getByRole("button", { name: "llama3.2 entfernen" })).toBeDefined()
    const input = screen.getByRole("combobox", { name: "Modelle" })
    await user.click(input)
    await user.type(input, "zzz")
    await waitFor(() => expect(screen.getByText("Keine Treffer")).toBeDefined())
  })

  it("adds a pick from the list in multiple mode", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <ComboboxField
        name="models"
        label="Models"
        multiple
        options={groups}
        onValueChange={onValueChange}
      />,
    )
    await user.click(screen.getByRole("combobox", { name: "Models" }))
    await user.click(await screen.findByRole("option", { name: /qwen2\.5/ }))
    expect(onValueChange).toHaveBeenLastCalledWith(["qwen"])
  })

  it("removes the last chip with Backspace in an empty input", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <ComboboxField
        name="models"
        label="Models"
        multiple
        options={groups}
        defaultValue={["llama", "qwen"]}
        onValueChange={onValueChange}
      />,
    )
    await user.click(screen.getByRole("combobox", { name: "Models" }))
    await user.keyboard("{Escape}{Backspace}")
    expect(onValueChange).toHaveBeenLastCalledWith(["llama"])
  })

  it("submits the picks under its name", () => {
    const { container } = render(
      <form>
        <ComboboxField
          name="models"
          label="Models"
          multiple
          options={groups}
          defaultValue={["llama", "qwen"]}
        />
        <ComboboxField name="model" label="Model" options={groups} defaultValue="qwen" />
      </form>,
    )
    const form = container.querySelector("form")
    if (form === null) throw new Error("form missing")
    const data = new FormData(form)
    expect(data.getAll("models")).toEqual(["llama", "qwen"])
    expect(data.get("model")).toBe("qwen")
  })
})
