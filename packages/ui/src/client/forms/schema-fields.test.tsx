// @vitest-environment jsdom

import { createFieldsForm, type FormObjectSchema } from "@plainworks/std/seam"
import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Form } from "./form"
import { FormSubmit } from "./form-submit"
import { SchemaFields } from "./schema-fields"

afterEach(cleanup)

const fields: FormObjectSchema = {
  type: "object",
  required: ["prompt", "mode"],
  properties: {
    prompt: { type: "string", format: "textarea", description: "What the model reads." },
    temperature: { type: "number", minimum: 0, maximum: 2, default: 0.7 },
    maxTokens: { type: "integer", minimum: 1 },
    stream: { type: "boolean", title: "Stream output", default: true },
    mode: {
      type: "string",
      oneOf: [
        { const: "fast", title: "Fast" },
        { const: "slow", title: "Slow" },
      ],
    },
    tags: { type: "array", items: { type: "string", enum: ["a", "b"] }, default: ["a"] },
    stop: { type: "object", title: "Stop rule", properties: { word: { type: "string" } } },
  },
}

describe("SchemaFields", () => {
  it("renders labelled controls for each field with no violations", async () => {
    const { container } = render(
      <Form schema={createFieldsForm(fields)} onSubmit={() => undefined}>
        <SchemaFields fields={fields} />
      </Form>,
    )
    expect(screen.getByRole("textbox", { name: /Prompt/ }).tagName).toBe("TEXTAREA")
    expect(screen.getByText("What the model reads.")).toBeDefined()
    expect((screen.getByRole("textbox", { name: "Temperature" }) as HTMLInputElement).value).toBe(
      "0.7",
    )
    expect(screen.getByRole("textbox", { name: "Max tokens" })).toBeDefined()
    expect(screen.getByRole("switch", { name: "Stream output" }).getAttribute("aria-checked")).toBe(
      "true",
    )
    expect(screen.getByRole("combobox", { name: /Mode/ })).toBeDefined()
    expect(screen.getByRole("group", { name: "Tags" })).toBeDefined()
    expect(screen.getByRole("checkbox", { name: "a" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("group", { name: "Stop rule" })).toBeDefined()
    expect(screen.getByRole("textbox", { name: "Word" }).getAttribute("name")).toBe("stop.word")
    await expectNoAxeViolations(container)
  })

  it("submits typed values that the same schema decoded", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <Form schema={createFieldsForm(fields)} onSubmit={onSubmit}>
        <SchemaFields fields={fields} />
        <FormSubmit>Run</FormSubmit>
      </Form>,
    )
    await user.type(screen.getByRole("textbox", { name: /Prompt/ }), "Hi")
    await user.selectOptions(screen.getByRole("combobox", { name: /Mode/ }), "slow")
    await user.click(screen.getByRole("checkbox", { name: "b" }))
    await user.type(screen.getByRole("textbox", { name: "Word" }), "END")
    await user.click(screen.getByRole("button", { name: "Run" }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      prompt: "Hi",
      temperature: 0.7,
      stream: true,
      mode: "slow",
      tags: ["a", "b"],
      stop: { word: "END" },
    })
  })

  it("shows each issue on its own control", async () => {
    const user = userEvent.setup()
    render(
      <Form schema={createFieldsForm(fields)} onSubmit={() => undefined}>
        <SchemaFields fields={fields} />
        <FormSubmit>Run</FormSubmit>
      </Form>,
    )
    await user.click(screen.getByRole("button", { name: "Run" }))
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: /Prompt/ }).getAttribute("aria-invalid")).toBe(
        "true",
      ),
    )
    expect(screen.getByRole("combobox", { name: /Mode/ }).getAttribute("aria-invalid")).toBe("true")
  })
})
