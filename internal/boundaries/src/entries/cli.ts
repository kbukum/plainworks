#!/usr/bin/env bun
import { resolve } from "node:path"
import { checkEntries } from "./entries"

const packagesDir = resolve(import.meta.dirname, "..", "..", "..", "..", "packages")
const failures = checkEntries(packagesDir)
if (failures.size > 0) {
  const lines = [...failures].flatMap(([name, shared]) =>
    shared.map((s) => `  ${name}: ${s.name} → ${s.entries.join(", ")}\n`),
  )
  process.stderr.write(`entries: these names have more than one import path:\n${lines.join("")}`)
  process.exitCode = 1
} else {
  process.stdout.write("entries: every public name has one import path\n")
}
