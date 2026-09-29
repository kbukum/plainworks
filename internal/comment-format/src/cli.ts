#!/usr/bin/env -S bun --conditions=@plainworks/source
import { readFileSync, writeFileSync } from "node:fs"
import { collectFiles } from "./collect"
import { runCommentFormat } from "./command"

process.exitCode = runCommentFormat(
  process.argv.slice(2),
  {
    collectFiles,
    readText: (path) => readFileSync(path, "utf8"),
    writeText: (path, text) => writeFileSync(path, text),
  },
  {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
)
