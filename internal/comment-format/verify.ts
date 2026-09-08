import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"
import { reflowSource } from "./reflow"
import { codeTokens } from "./safety"

/*
 * Safety audit for the reflow transform. For every source file it proves four invariants, so a
 * repo-wide `--write` provably cannot alter code:
 *
 *   1. Code tokens are byte-identical — the parser's non-comment token stream is unchanged.
 *   2. No new parse errors — the reflowed text parses with no more syntactic diagnostics.
 *   3. Comment words are preserved — reflow only rewraps whitespace, never drops or dupes a word.
 *   4. Fixed point — reflowing the output again is a no-op (safe to gate on).
 *
 * Usage: bun verify.ts <root> [<root> ...]
 */

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

/** Every word inside every comment, delimiters and star/slash prefixes stripped. */
function commentWords(path: string, text: string): string[] {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind)
  const words: string[] = []
  const seen = new Set<string>()
  const harvest = (ranges: ts.CommentRange[] | undefined): void => {
    if (ranges === undefined) return
    for (const r of ranges) {
      const key = `${r.pos}:${r.end}`
      if (seen.has(key)) continue
      seen.add(key)
      const body = text
        .slice(r.pos, r.end)
        .replace(/^\/\*\*?|\*\/$|^\/\//gm, "")
        .replace(/^\s*\*/gm, "")
      for (const w of body.match(/\S+/g) ?? []) words.push(w)
    }
  }
  const visit = (node: ts.Node): void => {
    harvest(ts.getLeadingCommentRanges(text, node.getFullStart()))
    harvest(ts.getTrailingCommentRanges(text, node.getEnd()))
    node.forEachChild(visit)
  }
  visit(sf)
  return words
}

function parseErrorCount(path: string, text: string): number {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind)
  // `parseDiagnostics` is internal but stable; fall back to 0 if absent.
  const diags = (sf as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics
  return diags?.length ?? 0
}

const roots = process.argv.slice(2)
let checked = 0
let changed = 0
const failures: string[] = []

for (const root of roots) {
  for (const file of collectFiles(root)) {
    const text = readFileSync(file, "utf8")
    const out = reflowSource(file, text)
    checked++
    if (out === text) continue
    changed++

    const beforeTokens = codeTokens(file, text).join("\u0000")
    const afterTokens = codeTokens(file, out).join("\u0000")
    if (beforeTokens !== afterTokens) failures.push(`${file}: code tokens changed`)

    const beforeWords = commentWords(file, text).join(" ")
    const afterWords = commentWords(file, out).join(" ")
    if (beforeWords !== afterWords) failures.push(`${file}: comment words changed`)

    if (parseErrorCount(file, out) > parseErrorCount(file, text)) {
      failures.push(`${file}: new parse errors`)
    }

    if (reflowSource(file, out) !== out) failures.push(`${file}: not a fixed point`)
  }
}

process.stdout.write(`comment-format verify: ${checked} files checked, ${changed} would change\n`)
if (failures.length > 0) {
  process.stderr.write(
    `\nSAFETY VIOLATIONS (${failures.length}):\n${failures.map((f) => `  ${f}\n`).join("")}`,
  )
  process.exit(1)
}
process.stdout.write("all four safety invariants hold on every changed file\n")
