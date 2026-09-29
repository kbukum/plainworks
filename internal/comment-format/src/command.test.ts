import { describe, expect, test } from "vitest"
import { type CommandOutput, type CommentFormatEnvironment, runCommentFormat } from "./command"

function run(
  args: readonly string[],
  files: Map<string, string>,
  reflowSource?: CommentFormatEnvironment["reflowSource"],
) {
  const writes: Array<readonly [string, string]> = []
  let stdout = ""
  let stderr = ""
  const output: CommandOutput = {
    stdout: (text) => {
      stdout += text
    },
    stderr: (text) => {
      stderr += text
    },
  }
  const env: CommentFormatEnvironment = {
    collectFiles: (root) => [...files.keys()].filter((path) => path.startsWith(root)),
    readText: (path) => {
      const text = files.get(path)
      if (text === undefined) throw new Error(`missing ${path}`)
      return text
    },
    writeText: (path, text) => {
      writes.push([path, text])
      files.set(path, text)
    },
    ...(reflowSource === undefined ? {} : { reflowSource }),
  }
  return { code: runCommentFormat(args, env, output), stdout, stderr, writes }
}

describe("runCommentFormat", () => {
  test("reports clean comments", () => {
    expect(run(["check", "src"], new Map([["src/a.ts", "// short\nconst a = 1\n"]]))).toMatchObject(
      {
        code: 0,
        stdout: "comment-format: all comments within width\n",
        stderr: "",
        writes: [],
      },
    )
  })

  test("reports over-width comments with the root fix hint", () => {
    const result = run(
      ["check", "src"],
      new Map([["src/a.ts", `// ${"word ".repeat(30).trim()}\nconst a = 1\n`]]),
    )
    expect(result.code).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("Run `bun run format-comments`:")
    expect(result.stderr).toContain("  src/a.ts\n")
  })

  test("writes every safe change after computing them all", () => {
    const files = new Map([
      ["src/a.ts", `// ${"word ".repeat(30).trim()}\nconst a = 1\n`],
      ["src/b.ts", `// ${"other ".repeat(30).trim()}\nconst b = 1\n`],
    ])
    const result = run(["write", "src"], files)
    expect(result.code).toBe(0)
    expect(result.stderr).toBe("")
    expect(result.stdout).toBe("comment-format: reflowed 2 file(s)\n")
    expect(result.writes).toHaveLength(2)
  })

  test("aborts write mode without writing when reflow would alter code", () => {
    const files = new Map([
      ["src/a.ts", "// one\nconst a = 1\n"],
      ["src/b.ts", "// two\nconst b = 1\n"],
    ])
    const result = run(["write", "src"], files, (path, text) =>
      path.endsWith("a.ts") ? text.replace("const a = 1", "const a = 2") : text,
    )

    expect(result.code).toBe(3)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("no files were written")
    expect(result.writes).toEqual([])
    expect(files.get("src/a.ts")).toBe("// one\nconst a = 1\n")
  })

  test("audits sources and reports safety violations", () => {
    const result = run(
      ["audit", "src"],
      new Map([["src/a.ts", `// ${"word ".repeat(30).trim()}\nconst a = 1\n`]]),
    )
    expect(result.code).toBe(0)
    expect(result.stdout).toContain("comment-format verify: 1 files checked, 1 would change\n")
    expect(result.stdout).toContain("all four safety invariants hold on every changed file\n")
    expect(result.stderr).toBe("")
  })

  test("reports usage errors", () => {
    expect(run([], new Map())).toMatchObject({
      code: 2,
      stderr: "Usage: plainworks-comment-format <check|write|audit> <root...>\n",
    })
    expect(run(["check"], new Map()).code).toBe(2)
  })
})
