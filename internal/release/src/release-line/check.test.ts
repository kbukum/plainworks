import { describe, expect, it } from "vitest"
import { ReleaseToolError } from "../error"
import type { PublishableWorkspace } from "../workspace"
import { findReleaseLineProblems } from "./check"
import { parsePreState } from "./pre-state"

function workspace(name: string, version: string): PublishableWorkspace {
  return { dir: `packages/${name}`, name, version, deps: [] }
}

describe("findReleaseLineProblems", () => {
  it("passes while pre mode is on and every package is on its tag", () => {
    const workspaces = [workspace("std", "0.1.0-alpha.1"), workspace("ui", "0.1.0-alpha.4")]
    expect(findReleaseLineProblems({ mode: "pre", tag: "alpha" }, workspaces)).toEqual([])
  })

  it("fails a package that is off the pre-release line while pre mode is on", () => {
    const workspaces = [
      workspace("std", "0.1.0-alpha.1"),
      workspace("create", "0.0.0"),
      workspace("ui", "0.1.0-beta.1"),
    ]
    expect(findReleaseLineProblems({ mode: "pre", tag: "alpha" }, workspaces)).toEqual([
      "create is 0.0.0, but pre mode is on the alpha line. Set it to a -alpha.N version.",
      "ui is 0.1.0-beta.1, but pre mode is on the alpha line. Set it to a -alpha.N version.",
    ])
  })

  it("fails a prerelease version when pre mode is off, since the next bump would be stable", () => {
    const workspaces = [workspace("std", "0.1.0-alpha.3"), workspace("ui", "0.1.0")]
    expect(findReleaseLineProblems(undefined, workspaces)).toEqual([
      "std is 0.1.0-alpha.3, but pre mode is off, so the next `changeset version` would publish a " +
        "stable version. Run `changeset pre enter alpha`, or `changeset pre exit` to graduate.",
    ])
  })

  it("passes stable versions once the line has graduated", () => {
    expect(findReleaseLineProblems(undefined, [workspace("std", "0.1.0")])).toEqual([])
  })

  it("allows prerelease versions while exiting pre mode to graduate", () => {
    const workspaces = [workspace("std", "0.1.0-alpha.3")]
    expect(findReleaseLineProblems({ mode: "exit", tag: "alpha" }, workspaces)).toEqual([])
  })

  it("fails a version that is not semver", () => {
    expect(findReleaseLineProblems(undefined, [workspace("std", "latest")])).toEqual([
      "std has an invalid version: latest.",
    ])
  })
})

describe("parsePreState", () => {
  it("reads the mode and tag Changesets writes", () => {
    expect(parsePreState('{ "mode": "pre", "tag": "alpha" }')).toEqual({
      mode: "pre",
      tag: "alpha",
    })
    expect(parsePreState('{ "mode": "exit", "tag": "alpha", "extra": 1 }')).toEqual({
      mode: "exit",
      tag: "alpha",
    })
  })

  it("rejects a malformed pre.json", () => {
    expect(() => parsePreState("{")).toThrow(ReleaseToolError)
    expect(() => parsePreState('{ "mode": "on", "tag": "alpha" }')).toThrow(/mode/)
    expect(() => parsePreState('{ "mode": "pre", "tag": "" }')).toThrow(/tag/)
  })
})
