#!/usr/bin/env bun
import { resolve } from "node:path"
import { runReleaseCommand } from "./command"
import { nodeWorkspaceFiles } from "./workspace"

const repoRoot = resolve(import.meta.dirname, "..", "..", "..")

process.exitCode = runReleaseCommand(process.argv.slice(2), nodeWorkspaceFiles(repoRoot), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
})
