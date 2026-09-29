import ts from "typescript"
import { reflowSource } from "./reflow"
import { codeTokens } from "./safety"

/** One source file audited by the comment-format safety check. */
export interface AuditSource {
  readonly path: string
  readonly text: string
}

/** Function used to reflow a source file; injectable so tests can prove every invariant. */
export type ReflowSource = (path: string, text: string) => string

/** Result of auditing every changed file. */
export interface AuditResult {
  readonly checked: number
  readonly changed: number
  readonly failures: readonly string[]
}

/** Run the four safety invariants over the provided source files. */
export function auditSources(
  sources: readonly AuditSource[],
  reflow: ReflowSource = reflowSource,
): AuditResult {
  let changed = 0
  const failures: string[] = []
  for (const { path, text } of sources) {
    const out = reflow(path, text)
    if (out === text) continue
    changed++

    const beforeTokens = codeTokens(path, text).join("\u0000")
    const afterTokens = codeTokens(path, out).join("\u0000")
    if (beforeTokens !== afterTokens) failures.push(`${path}: code tokens changed`)

    const beforeWords = commentWords(path, text).join(" ")
    const afterWords = commentWords(path, out).join(" ")
    if (beforeWords !== afterWords) failures.push(`${path}: comment words changed`)

    if (parseErrorCount(path, out) > parseErrorCount(path, text)) {
      failures.push(`${path}: new parse errors`)
    }

    if (reflow(path, out) !== out) failures.push(`${path}: not a fixed point`)
  }
  return { checked: sources.length, changed, failures }
}

/** Every word inside every comment, delimiters and star/slash prefixes stripped. */
function commentWords(path: string, text: string): string[] {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind)
  const words: string[] = []
  const seen = new Set<string>()
  const harvest = (ranges: ts.CommentRange[] | undefined): void => {
    if (ranges === undefined) return
    for (const range of ranges) {
      const key = `${range.pos}:${range.end}`
      if (seen.has(key)) continue
      seen.add(key)
      const body = text
        .slice(range.pos, range.end)
        .replace(/^\/\*\*?|\*\/$|^\/\//gm, "")
        .replace(/^\s*\*/gm, "")
      for (const word of body.match(/\S+/g) ?? []) words.push(word)
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
  return hasParseDiagnostics(sf) ? sf.parseDiagnostics.length : 0
}

function hasParseDiagnostics(
  sourceFile: ts.SourceFile,
): sourceFile is ts.SourceFile & { readonly parseDiagnostics: readonly unknown[] } {
  return "parseDiagnostics" in sourceFile && Array.isArray(sourceFile.parseDiagnostics)
}
