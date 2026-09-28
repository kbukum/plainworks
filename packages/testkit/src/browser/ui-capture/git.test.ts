import { describe, expect, it } from "vitest"
import { UiCaptureError } from "./errors"
import { changedFilesSince, type GitRunner, mergeBaseWith } from "./git"

function fakeGit(answers: Record<string, string | Error>): GitRunner & { calls: string[] } {
  const calls: string[] = []
  const git = async (args: readonly string[]) => {
    const key = args.join(" ")
    calls.push(key)
    const answer = answers[key]
    if (answer === undefined) throw new Error(`unexpected git ${key}`)
    if (answer instanceof Error) throw answer
    return answer
  }
  return Object.assign(git, { calls })
}

describe("mergeBaseWith", () => {
  it("resolves the commit HEAD shares with the ref", async () => {
    const git = fakeGit({ "merge-base HEAD origin/main": "abc123\n" })
    expect(await mergeBaseWith(git, "origin/main")).toBe("abc123")
  })

  it("fails with a git error that names the ref", async () => {
    const git = fakeGit({
      "merge-base HEAD nope": new Error("fatal: Not a valid object name nope"),
    })
    await expect(mergeBaseWith(git, "nope")).rejects.toThrow(UiCaptureError)
    await expect(mergeBaseWith(git, "nope")).rejects.toMatchObject({
      kind: "git",
      message: expect.stringContaining('"nope"'),
    })
  })
})

describe("changedFilesSince", () => {
  it("lists committed, staged, unstaged, and untracked changes once, sorted", async () => {
    const git = fakeGit({
      "diff --name-only --no-renames -z abc123": "b.ts\0a.ts\0",
      "ls-files --others --exclude-standard --full-name -z -- :/": "c.ts\0a.ts\0",
    })
    expect(await changedFilesSince(git, "abc123")).toEqual(["a.ts", "b.ts", "c.ts"])
  })
})
