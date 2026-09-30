#!/usr/bin/env -S bun --conditions=@plainworks/source
import { readFileSync } from "node:fs"
import { relative } from "node:path"
import { collectRenderTests } from "./collect"
import { runCommand } from "./command"

process.exitCode = runCommand(
  process.argv.slice(2),
  (root) =>
    collectRenderTests(root).map((path) => ({
      path: relative(process.cwd(), path),
      source: readFileSync(path, "utf8"),
    })),
  {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
)
