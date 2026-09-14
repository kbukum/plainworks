// @vitest-environment jsdom

import { fakeSchema } from "@plainworks/testkit"
import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Field } from "./field"
import { TextField } from "./fields"
import { Form } from "./form"
import type { FormValues } from "./form-data"
import { FormSubmit } from "./form-submit"

afterEach(cleanup)

// A schema that requires a non-empty `email` and reports the failure on that field's path, plus an
// optional cross-field message with no path to exercise the form-level bucket.
function emailSchema(options: { readonly formIssue?: boolean } = {}) {
  return fakeSchema<{ email: string }>((raw) => {
    const values = raw as Record<string, unknown>
    const email = typeof values.email === "string" ? values.email : ""
    if (email.length === 0) {
      const issues = [{ message: "Email is required", path: ["email"] }]
      if (options.formIssue) issues.push({ message: "Fix the errors below", path: [] })
      return { issues }
    }
    return { value: { email } }
  })
}

describe("Form", () => {
  it("blocks submission and shows a field-scoped error when validation fails", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <Form schema={emailSchema()} onSubmit={onSubmit}>
        <TextField name="email" label="Email" />
        <FormSubmit>Save</FormSubmit>
      </Form>,
    )

    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(screen.getByText("Email is required")).toBeDefined())
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText("Email").getAttribute("aria-invalid")).toBe("true")
  })

  it("keeps entered values when another field fails validation", async () => {
    const user = userEvent.setup()
    render(
      <Form schema={emailSchema()} onSubmit={vi.fn()}>
        <TextField name="name" label="Name" />
        <TextField name="email" label="Email" />
        <FormSubmit>Save</FormSubmit>
      </Form>,
    )

    await user.type(screen.getByLabelText("Name"), "Ada")
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(screen.getByText("Email is required")).toBeDefined())
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Ada")
  })

  it("validates, then calls onSubmit with the parsed value", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <Form schema={emailSchema()} onSubmit={onSubmit}>
        <TextField name="email" label="Email" />
        <FormSubmit>Save</FormSubmit>
      </Form>,
    )

    await user.type(screen.getByLabelText("Email"), "a@b.com")
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ email: "a@b.com" }))
  })

  it("surfaces path-less issues in a labelled form-level alert", async () => {
    const user = userEvent.setup()
    render(
      <Form schema={emailSchema({ formIssue: true })} onSubmit={vi.fn()}>
        <TextField name="email" label="Email" />
        <FormSubmit>Save</FormSubmit>
      </Form>,
    )

    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(screen.getByText("Fix the errors below")).toBeDefined())
    expect(screen.getByRole("region", { name: "Form error" })).toBeDefined()
  })

  it("passes the raw decoded values to onSubmit when no schema is given", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <Form onSubmit={onSubmit}>
        <TextField name="email" label="Email" />
        <FormSubmit>Save</FormSubmit>
      </Form>,
    )

    await user.type(screen.getByLabelText("Email"), "hi")
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ email: "hi" }))
  })

  it("has no accessibility violations", async () => {
    const { container } = render(
      <Form onSubmit={vi.fn()}>
        <TextField name="email" label="Email" description="Your work email" />
        <FormSubmit>Save</FormSubmit>
      </Form>,
    )
    await expectNoAxeViolations(container)
  })
})

describe("FormSubmit", () => {
  it("renders a submit button and disables it while the action runs", async () => {
    const user = userEvent.setup()
    let release = (): void => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    render(
      <Form onSubmit={() => gate}>
        <TextField name="email" label="Email" />
        <FormSubmit pendingLabel="Saving…">Save</FormSubmit>
      </Form>,
    )

    const button = screen.getByRole("button", { name: "Save" })
    expect(button.getAttribute("type")).toBe("submit")

    await user.click(button)
    await waitFor(() => expect(screen.getByRole("button", { name: "Saving…" })).toBeDefined())
    const pendingButton = screen.getByRole("button", { name: "Saving…" })
    expect(pendingButton.hasAttribute("disabled")).toBe(true)
    expect(pendingButton.getAttribute("aria-busy")).toBe("true")

    release()
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeDefined())
  })
})

describe("Field", () => {
  it("associates label, description, and control outside a form", () => {
    render(
      <Field name="city" label="City" description="Where you live">
        {(control) => <input {...control} />}
      </Field>,
    )
    const input = screen.getByLabelText("City")
    const describedBy = input.getAttribute("aria-describedby")
    expect(describedBy).not.toBeNull()
    expect(screen.getByText("Where you live").id).toBe(describedBy)
    expect(input.hasAttribute("aria-invalid")).toBe(false)
  })
})

describe("Form typing", () => {
  it("keeps onSubmit sound across the schema / schema-less split", () => {
    interface User {
      readonly email: string
    }

    // Schema-less: onSubmit accepts the raw decoded form values.
    const onValues = (_values: FormValues): void => {}
    const schemaless = (
      <Form onSubmit={onValues}>
        <FormSubmit>Save</FormSubmit>
      </Form>
    )

    // With a schema: onSubmit accepts the schema's validated output.
    const onUser = (_user: User): void => {}
    const withSchema = (
      <Form<User> schema={fakeSchema<User>((raw) => ({ value: raw as User }))} onSubmit={onUser}>
        <FormSubmit>Save</FormSubmit>
      </Form>
    )

    // A caller cannot name a narrowed Output without supplying a matching schema.
    const unsound = (
      // @ts-expect-error a schema-less Form cannot narrow onSubmit's value to User
      <Form<User> onSubmit={onUser}>
        <FormSubmit>Save</FormSubmit>
      </Form>
    )

    expect([schemaless, withSchema, unsound]).toHaveLength(3)
  })
})
