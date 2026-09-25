// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { Button } from "@/shadcn/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shadcn/empty"

afterEach(cleanup)

function Example() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon" aria-hidden="true" />
        <EmptyTitle>No projects yet</EmptyTitle>
        <EmptyDescription>Create your first project to get started.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button>New project</Button>
      </EmptyContent>
    </Empty>
  )
}

describe("Empty", () => {
  it("keeps the primary action reachable", () => {
    render(<Example />)
    expect(screen.getByRole("button", { name: "New project" })).toBeTruthy()
  })

  it("has no axe violations", async () => {
    const { container } = render(<Example />)
    await expectNoAxeViolations(container)
  })
})
