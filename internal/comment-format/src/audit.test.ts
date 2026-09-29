import { describe, expect, test } from "vitest"
import { auditSources, type ReflowSource } from "./audit"

const source = { path: "sample.ts", text: "// original words\nconst a = 1\n" }

describe("auditSources", () => {
  test("passes unchanged sources", () => {
    expect(auditSources([source])).toEqual({ checked: 1, changed: 0, failures: [] })
  })

  test("reports code token changes", () => {
    const reflow: ReflowSource = () => "// original words\nconst a = 2\n"
    expect(auditSources([source], reflow).failures).toEqual(["sample.ts: code tokens changed"])
  })

  test("reports comment word changes", () => {
    const reflow: ReflowSource = () => "// different words\nconst a = 1\n"
    expect(auditSources([source], reflow).failures).toEqual(["sample.ts: comment words changed"])
  })

  test("reports new parse errors", () => {
    const reflow: ReflowSource = () => "// original words\nconst a = \n"
    expect(auditSources([source], reflow).failures).toContain("sample.ts: new parse errors")
  })

  test("reports non-fixed-point output", () => {
    const reflow: ReflowSource = (_path, text) =>
      text.includes("wrapped")
        ? text.replace("wrapped", "wrapped again")
        : "// original words wrapped\nconst a = 1\n"
    expect(auditSources([source], reflow).failures).toContain("sample.ts: not a fixed point")
  })
})
