import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { reflowSource } from "./reflow"
import { codeUnchanged } from "./safety"

const EXCLUDE = /(^|\/)(node_modules|dist|\.turbo|coverage|gen|fixtures)(\/|$)/

function collectFiles(root: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const path = join(entry.parentPath, entry.name)
    if (EXCLUDE.test(path)) continue
    if (path.endsWith(".ts") || path.endsWith(".tsx")) files.push(path)
  }
  return files
}

function main(): void {
  const args = process.argv.slice(2)
  const write = args.includes("--write")
  const check = args.includes("--check")
  const roots = args.filter((a) => !a.startsWith("--"))
  if (!write && !check) {
    process.stderr.write("usage: comment-format (--check | --write) <root> [<root> ...]\n")
    process.exit(2)
  }

  const offenders: string[] = []
  for (const root of roots) {
    for (const file of collectFiles(root)) {
      const text = readFileSync(file, "utf8")
      const reflowed = reflowSource(file, text)
      if (reflowed === text) continue
      if (!codeUnchanged(file, text, reflowed)) {
        process.stderr.write(
          `comment-format: ABORTED — reflow would alter code in ${file}. This is a bug in the reflow transform; no files were written.\n`,
        )
        process.exit(3)
      }
      offenders.push(file)
      if (write) writeFileSync(file, reflowed)
    }
  }

  if (write) {
    process.stdout.write(`comment-format: reflowed ${offenders.length} file(s)\n`)
    return
  }
  if (offenders.length > 0) {
    process.stderr.write(
      `comment-format: ${offenders.length} file(s) have over-width comments. Run \`bun run --filter @plainworks/comment-format write\`:\n` +
        offenders.map((f) => `  ${f}\n`).join(""),
    )
    process.exit(1)
  }
  process.stdout.write("comment-format: all comments within width\n")
}

main()
