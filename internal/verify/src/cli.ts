#!/usr/bin/env -S bun --conditions=@plainworks/source
import { spawnSync } from "node:child_process"
import { closeSync, mkdirSync, openSync, readFileSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"
import { runVerify } from "./run"

const repoRoot = resolve(import.meta.dirname, "..", "..", "..")
// Each run replaces the previous logs: they explain the latest failure, not a history.
const logDir = join(repoRoot, "node_modules", ".cache", "plainworks-verify")
let logDirReady = false

process.exitCode = runVerify(process.argv.slice(2), {
  run: ([command = "", ...args], output) => {
    if (output.kind === "inherit") {
      const result = spawnSync(command, args, { cwd: repoRoot, stdio: "inherit" })
      if (result.error !== undefined) throw result.error
      return result.status ?? 1
    }
    // One descriptor for both streams keeps stdout and stderr in their real order.
    const fd = openSync(output.path, "a", 0o600)
    try {
      const result = spawnSync(command, args, { cwd: repoRoot, stdio: ["ignore", fd, fd] })
      if (result.error !== undefined) throw result.error
      return result.status ?? 1
    } finally {
      closeSync(fd)
    }
  },
  read: (path) => readFileSync(path, "utf8"),
  logPath: (gate) => {
    if (!logDirReady) {
      rmSync(logDir, { recursive: true, force: true })
      mkdirSync(logDir, { recursive: true, mode: 0o700 })
      logDirReady = true
    }
    return join(logDir, `${gate}.log`)
  },
  now: () => performance.now(),
  write: (text) => process.stdout.write(text),
})
