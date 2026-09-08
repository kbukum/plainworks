import ts from "typescript"

/** The print width comment prose is wrapped to — matches Biome's `lineWidth`. */
export const MAX_WIDTH = 100

// `//` comments that must never be reflowed: machine-read directives and file-level markers.
const DIRECTIVE =
  /^(biome-ignore|eslint-|prettier-ignore|@ts-|c8 |v8 ignore|dprint-|#region|#endregion|region\b|endregion\b|\/|!)/

// Node kinds whose text can contain `//` or `/*` as literal content. A child node inside a template
// or JSX element gives `getLeading/TrailingCommentRanges` a scan position inside that literal text,
// where a raw re-scan mistakes such content for a comment — so any candidate overlapping one is dropped.
const LITERAL_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.JsxText,
])

/** Collect every comment range via the parser, excluding false positives inside template/JSX literal text (a `//` in a string or template is never seen as a comment). */
function collectComments(path: string, text: string): ts.CommentRange[] {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind)
  const seen = new Map<string, ts.CommentRange>()
  const literalSpans: Array<readonly [number, number]> = []
  const add = (ranges: ts.CommentRange[] | undefined): void => {
    if (ranges === undefined) return
    for (const r of ranges) seen.set(`${r.pos}:${r.end}`, r)
  }
  const visit = (node: ts.Node): void => {
    if (LITERAL_KINDS.has(node.kind)) literalSpans.push([node.getStart(sf), node.getEnd()])
    add(ts.getLeadingCommentRanges(text, node.getFullStart()))
    add(ts.getTrailingCommentRanges(text, node.getEnd()))
    node.forEachChild(visit)
  }
  visit(sf)
  const insideLiteral = (r: ts.CommentRange): boolean =>
    literalSpans.some(([start, end]) => r.pos < end && r.end > start)
  return [...seen.values()].filter((r) => !insideLiteral(r)).sort((a, b) => a.pos - b.pos)
}

/** Greedy word wrap. A single word wider than the budget stands on its own line rather than being split (a URL stays intact). */
function wrap(words: readonly string[], firstPrefix: string, contPrefix: string): string[] {
  const lines: string[] = []
  let line = firstPrefix
  let width = firstPrefix.length
  let empty = true
  for (const word of words) {
    if (!empty && width + 1 + word.length > MAX_WIDTH) {
      lines.push(line)
      line = contPrefix + word
      width = contPrefix.length + word.length
    } else {
      line += empty ? word : ` ${word}`
      width += empty ? word.length : 1 + word.length
    }
    empty = false
  }
  lines.push(line)
  return lines
}

/** Split prose into wrap units: maximal non-whitespace runs, extended to swallow spaces that sit inside `` `code` `` or `{@link ...}` so those stay atomic. Re-joining units with single spaces never introduces a space at an original no-space boundary. */
function tokenize(prose: string): string[] {
  const units: string[] = []
  let i = 0
  const n = prose.length
  const isSpace = (c: string): boolean => c === " " || c === "\t"
  while (i < n) {
    while (i < n && isSpace(prose[i] ?? "")) i++
    if (i >= n) break
    const start = i
    while (i < n && !isSpace(prose[i] ?? "")) {
      if (prose[i] === "`") {
        const close = prose.indexOf("`", i + 1)
        if (close !== -1) {
          i = close + 1
          continue
        }
      }
      if (prose[i] === "{" && prose[i + 1] === "@") {
        const close = prose.indexOf("}", i + 1)
        if (close !== -1) {
          i = close + 1
          continue
        }
      }
      i++
    }
    units.push(prose.slice(start, i))
  }
  return units
}

function leadingWhitespace(line: string): string {
  return line.slice(0, line.length - line.trimStart().length)
}

function reflowLineComment(text: string, indent: string, isTrailing: boolean): string | null {
  if (isTrailing) return null
  const content = text.slice(2).replace(/^\s/, "") // drop `//` and one leading space
  if (DIRECTIVE.test(content)) return null
  if (!/\s/.test(content.trim())) return null // a bare token (e.g. a URL) is unbreakable
  if (indent.length + text.length <= MAX_WIDTH) return null
  const prefix = `${indent}// `
  const lines = wrap(tokenize(content), prefix, prefix)
  const first = lines[0]
  if (first !== undefined) lines[0] = first.slice(indent.length) // indent already precedes the comment
  return lines.join("\n")
}

interface ListMarker {
  readonly marker: string
  readonly hang: string
  readonly rest: string
}

function listMarker(content: string): ListMarker | null {
  const m = content.match(/^(\s*)([-*+]|\d+[.)])(\s+)(.*)$/)
  if (m === null) return null
  const [, lead = "", bullet = "", gap = "", rest = ""] = m
  const marker = `${lead}${bullet}${gap}`
  return { marker, hang: " ".repeat(marker.length), rest }
}

interface Paragraph {
  firstPrefix: string
  contPrefix: string
  words: string[]
}

function reflowBlockComment(text: string, indent: string, isTrailing: boolean): string | null {
  if (isTrailing || !text.startsWith("/**")) return null
  const raw = text.split("\n")
  if (raw.length < 2) return null // single-line block: leave alone
  const last = raw[raw.length - 1]
  if (last === undefined || !/^\s*\*\/$/.test(last)) return null

  const contents: string[] = []
  for (const line of raw.slice(1, -1)) {
    const m = line.match(/^\s*\*( ?)(.*)$/)
    if (m === null) return null // not star-aligned: unusual block, don't risk mangling it
    contents.push((m[2] ?? "").replace(/\s+$/, ""))
  }
  const widest = Math.max(...raw.map((l) => indent.length + l.length))
  if (widest <= MAX_WIDTH) return null

  const star = `${indent} * `
  const out: string[] = [`${indent}/**`]
  let para: Paragraph | null = null
  let inFence = false
  const flush = (): void => {
    if (para === null) return
    for (const line of wrap(para.words, para.firstPrefix, para.contPrefix)) out.push(line)
    para = null
  }
  for (const content of contents) {
    const trimmed = content.trim()
    if (inFence) {
      out.push(star + content)
      if (/^(```|~~~)/.test(trimmed)) inFence = false
      continue
    }
    if (/^(```|~~~)/.test(trimmed)) {
      flush()
      out.push(star + content)
      inFence = true
      continue
    }
    if (trimmed === "") {
      flush()
      out.push(`${indent} *`)
      continue
    }
    if (trimmed.startsWith("|")) {
      flush()
      out.push(star + content) // table row: layout is significant, keep verbatim
      continue
    }
    const list = listMarker(content)
    if (/^@[a-zA-Z]+/.test(trimmed)) {
      flush()
      para = { firstPrefix: star, contPrefix: `${star}  `, words: tokenize(trimmed) }
    } else if (list !== null) {
      flush()
      para = {
        firstPrefix: star + list.marker,
        contPrefix: star + list.hang,
        words: tokenize(list.rest),
      }
    } else if (para !== null) {
      for (const word of tokenize(trimmed)) para.words.push(word)
    } else {
      para = { firstPrefix: star, contPrefix: star, words: tokenize(trimmed) }
    }
  }
  flush()
  out.push(`${indent} */`)
  const first = out[0]
  if (first !== undefined) out[0] = first.slice(indent.length) // indent already precedes the comment
  return out.join("\n")
}

function lineStartOf(text: string, pos: number): number {
  let i = pos
  while (i > 0 && text[i - 1] !== "\n") i--
  return i
}

/** Return `text` with every over-width comment reflowed. Non-comment code and already-fitting comments are byte-identical, so the transform is a stable fixed point (safe to gate on). */
export function reflowSource(path: string, text: string): string {
  const edits: Array<{ pos: number; end: number; replacement: string }> = []
  for (const c of collectComments(path, text)) {
    const before = text.slice(lineStartOf(text, c.pos), c.pos)
    const isTrailing = before.trim().length > 0
    const indent = leadingWhitespace(before)
    const original = text.slice(c.pos, c.end)
    const replacement =
      c.kind === ts.SyntaxKind.SingleLineCommentTrivia
        ? reflowLineComment(original, indent, isTrailing)
        : reflowBlockComment(original, indent, isTrailing)
    if (replacement !== null && replacement !== original) {
      edits.push({ pos: c.pos, end: c.end, replacement })
    }
  }
  if (edits.length === 0) return text
  edits.sort((a, b) => b.pos - a.pos)
  let out = text
  for (const e of edits) out = out.slice(0, e.pos) + e.replacement + out.slice(e.end)
  return out
}
