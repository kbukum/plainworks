#!/usr/bin/env bun
import { spawnSync } from "node:child_process"
import { resolve } from "node:path"
import { runVerify } from "./run"

const repoRoot = resolve(import.meta.dirname, "..", "..", "..")

process.exitCode = runVerify(
  process.argv.slice(2),
  ([command = "", ...args]) => {
    const result = spawnSync(command, args, { cwd: repoRoot, stdio: "inherit" })
    if (result.error !== undefined) throw result.error
    return result.status ?? 1
  },
  (text) => process.stdout.write(text),
)
