import { describe, expect, it } from "vitest"
import { findAxeCoverageViolations } from "./coverage"

const path = "packages/example/src/client/button.test.tsx"
const renderImport = 'import { render } from "@testing-library/react"\n'

describe("findAxeCoverageViolations", () => {
  it("accepts a render test that runs the shared axe assertion", () => {
    const source = `${renderImport}const { container } = render(<button>Save</button>)\nawait expectNoAxeViolations(container)\n`
    expect(findAxeCoverageViolations([{ path, source }])).toEqual([])
  })

  it("fails when a render test omits its axe assertion", () => {
    const source = `${renderImport}render(<button>Save</button>)\n`
    expect(findAxeCoverageViolations([{ path, source }])).toEqual([
      `${path}: render test file never awaits an axe assertion`,
    ])
  })

  it("fails when the axe assertion is not awaited", () => {
    const source = `${renderImport}const { container } = render(<b />)\nexpectNoAxeViolations(container)\n`
    expect(findAxeCoverageViolations([{ path, source }])).toEqual([
      `${path}: render test file never awaits an axe assertion`,
    ])
  })

  it("accepts a file where one test runs axe and others only render", () => {
    const source = `${renderImport}it("a", async () => {\n  const { container } = render(<b />)\n  await expectNoAxeViolations(container)\n})\nit("b", () => {\n  render(<b />)\n})\n`
    expect(findAxeCoverageViolations([{ path, source }])).toEqual([])
  })

  it.each(['import axe from "axe-core"\n', "import axe from 'axe-core'\n"])(
    "keeps axe behind the shared helper: %s",
    (axeImport) => {
      const source = `${axeImport}${renderImport}const { container } = render(<b />)\nawait expectNoAxeViolations(container)\n`
      expect(findAxeCoverageViolations([{ path, source }])).toEqual([
        `${path}: import axe through @plainworks/testkit/client`,
      ])
    },
  )

  it("ignores a test that never renders", () => {
    const source = 'import { renderHook } from "@testing-library/react"\nrenderHook(() => 1)\n'
    expect(findAxeCoverageViolations([{ path, source }])).toEqual([])
  })
})
