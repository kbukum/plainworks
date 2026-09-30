import { describe, expect, it } from "vitest"
import { type CommandOutput, type RenderTestReader, runCommand } from "./command"

function recorder(): CommandOutput & { readonly text: () => string } {
  let text = ""
  return {
    stdout: (chunk) => {
      text += chunk
    },
    stderr: (chunk) => {
      text += chunk
    },
    text: () => text,
  }
}

const covered =
  'import { render } from "@testing-library/react"\nrender(<b />)\nawait expectNoAxeViolations(c)\n'
const uncovered = 'import { render } from "@testing-library/react"\nrender(<b />)\n'

const reader =
  (sources: Record<string, string>): RenderTestReader =>
  (root) =>
    Object.entries(sources)
      .filter(([path]) => path.startsWith(`${root}/`))
      .map(([path, source]) => ({ path, source }))

describe("runCommand", () => {
  it("passes when every render test under every root runs axe", () => {
    const output = recorder()
    const read = reader({ "packages/a.test.tsx": covered, "apps/b.test.tsx": covered })
    expect(runCommand(["packages", "apps"], read, output)).toBe(0)
    expect(output.text()).toContain("2 render test files run axe")
  })

  it("fails and names each uncovered test", () => {
    const output = recorder()
    const read = reader({ "packages/a.test.tsx": covered, "apps/b.test.tsx": uncovered })
    expect(runCommand(["packages", "apps"], read, output)).toBe(1)
    expect(output.text()).toBe("apps/b.test.tsx: render test file never awaits an axe assertion\n")
  })

  it("rejects a call with no roots", () => {
    const output = recorder()
    expect(runCommand([], reader({}), output)).toBe(2)
    expect(output.text()).toContain("Usage: plainworks-axe-coverage <root>...")
  })
})
