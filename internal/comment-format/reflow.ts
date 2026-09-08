import ts from "typescript"

/** The print width comment prose is wrapped to — matches Biome's `lineWidth`. */
export const MAX_WIDTH = 100

/**
 * How far short of {@link MAX_WIDTH} a sentence boundary may sit and still win over a fuller greedy
 * line. When a greedy line would carry the first words of a *new* sentence, breaking at that
 * boundary reads better — but only if it costs little: the boundary must land within this many
 * columns of the margin. A boundary further left is ignored, so we never trade a full line for a
 * short ragged one.
 */
const SENTENCE_WINDOW = 10

/** Abbreviations whose trailing period does not end a sentence, so a wrap must not break after them. */
const ABBREVIATIONS = new Set([
  "e.g.",
  "i.e.",
  "etc.",
  "vs.",
  "cf.",
  "al.",
  "approx.",
  "ca.",
  "no.",
])

/**
 * Whether `word` ends a sentence: terminal punctuation (after any closing quote/bracket), not a
 * known abbreviation and not a bare number like `3.` (a list ordinal or version fragment).
 */
function endsSentence(word: string): boolean {
  const core = word.replace(/[)\]"'`»]+$/, "")
  if (!/[.!?]$/.test(core)) return false
  if (ABBREVIATIONS.has(core.toLowerCase())) return false
  return !/^\d+\.$/.test(core)
}

/** Whether `word` looks like the start of a new sentence: a capital, a digit, or a `{@tag}`. */
function startsSentence(word: string): boolean {
  const first = word.replace(/^[("'`«]+/, "")[0]
  return first !== undefined && (/[A-Z0-9]/.test(first) || word.startsWith("{@"))
}

/**
 * Greedy word wrap with bounded sentence awareness. A single word wider than the budget stands on
 * its own line rather than being split (a URL stays intact). When a full greedy line would begin a
 * new sentence, and that sentence's boundary sits within {@link SENTENCE_WINDOW} columns of the
 * margin, the line breaks at the boundary instead so the new sentence starts fresh on the next
 * line.
 */
function wrap(words: readonly string[], firstPrefix: string, contPrefix: string): string[] {
  const lines: string[] = []
  let i = 0
  let prefix = firstPrefix
  while (i < words.length) {
    // Greedy fill: the largest run words[i..k) that fits the width (at least one word).
    let k = i + 1
    let width = prefix.length + (words[i]?.length ?? 0)
    while (k < words.length) {
      const next = words[k]?.length ?? 0
      if (width + 1 + next > MAX_WIDTH) break
      width += 1 + next
      k++
    }
    // Prefer an earlier break at a sentence boundary when it costs less than the window: scan from
    // the fullest line inward, stopping once the line would fall outside the window.
    let end = k
    let scanWidth = width
    for (let m = k; m > i + 1; m--) {
      if (scanWidth < MAX_WIDTH - SENTENCE_WINDOW) break
      const prev = words[m - 1]
      const nextWord = words[m]
      if (
        nextWord !== undefined &&
        prev !== undefined &&
        endsSentence(prev) &&
        startsSentence(nextWord)
      ) {
        end = m
        break
      }
      scanWidth -= 1 + (words[m - 1]?.length ?? 0)
    }
    lines.push(prefix + words.slice(i, end).join(" "))
    i = end
    prefix = contPrefix
  }
  return lines
}

// `//` comments that must never be reflowed: machine-read directives and file-level markers.
const DIRECTIVE =
  /^(biome-ignore|eslint-|prettier-ignore|@ts-|c8 |v8 ignore|dprint-|#region|#endregion|region\b|endregion\b|\/|!)/

// Node kinds whose text can contain `//` or `/*` as literal content. A child node inside a template
// or JSX element gives `getLeading/TrailingCommentRanges` a scan position inside that literal text,
// where a raw re-scan mistakes such content for a comment — so any candidate overlapping one is
// dropped.
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

/**
 * Re-fill a run of prose lines (each already stripped of its `//` or ` * ` decoration) to the print
 * width. A paragraph flows across lines until a blank line, list marker, `@tag`, table row, or
 * fenced block breaks it, so an over-width first line spills its overflow into the following lines
 * instead of stranding a word on its own. `linePrefix` decorates prose/continuation lines;
 * `blankLine` is emitted verbatim for an empty line. Layout-significant lines (fences, tables) are
 * emitted unwrapped.
 */
function fillContentLines(
  contents: readonly string[],
  linePrefix: string,
  blankLine: string,
): string[] {
  const out: string[] = []
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
      out.push(linePrefix + content)
      if (/^(```|~~~)/.test(trimmed)) inFence = false
      continue
    }
    if (/^(```|~~~)/.test(trimmed)) {
      flush()
      out.push(linePrefix + content)
      inFence = true
      continue
    }
    if (trimmed === "") {
      flush()
      out.push(blankLine)
      continue
    }
    if (trimmed.startsWith("|")) {
      flush()
      out.push(linePrefix + content) // table row: layout is significant, keep verbatim
      continue
    }
    const list = listMarker(content)
    if (/^@[a-zA-Z]+/.test(trimmed)) {
      flush()
      para = { firstPrefix: linePrefix, contPrefix: `${linePrefix}  `, words: tokenize(trimmed) }
    } else if (list !== null) {
      flush()
      para = {
        firstPrefix: linePrefix + list.marker,
        contPrefix: linePrefix + list.hang,
        words: tokenize(list.rest),
      }
    } else if (para !== null) {
      for (const word of tokenize(trimmed)) para.words.push(word)
    } else {
      para = { firstPrefix: linePrefix, contPrefix: linePrefix, words: tokenize(trimmed) }
    }
  }
  flush()
  return out
}

/**
 * Reflow a run of consecutive own-line `//` comments as one paragraph block. The run is refilled
 * only when a physical line is over-width; a run that already fits is left byte-identical so
 * intentional line breaks survive. Returns `null` when there is nothing to change.
 */
function reflowLineGroup(indent: string, lines: readonly string[]): string | null {
  const widest = Math.max(...lines.map((l) => indent.length + l.length))
  if (widest <= MAX_WIDTH) return null
  const contents = lines.map((l) => l.slice(2).replace(/^\s/, "").replace(/\s+$/, ""))
  const out = fillContentLines(contents, `${indent}// `, `${indent}//`)
  const first = out[0]
  if (first !== undefined) out[0] = first.slice(indent.length) // indent already precedes the comment
  return out.join("\n")
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

  const out = [`${indent}/**`, ...fillContentLines(contents, `${indent} * `, `${indent} *`)]
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
  const comments = collectComments(path, text)
  const edits: Array<{ pos: number; end: number; replacement: string }> = []

  const isStandaloneLine = (c: ts.CommentRange): boolean => {
    if (c.kind !== ts.SyntaxKind.SingleLineCommentTrivia) return false
    const before = text.slice(lineStartOf(text, c.pos), c.pos)
    if (before.trim().length > 0) return false // trailing comment after code
    return !DIRECTIVE.test(text.slice(c.pos + 2, c.end).replace(/^\s/, ""))
  }
  // Two own-line comments belong to one paragraph when only a single line break (plus the shared
  // indent) sits between them; a blank line ends the run.
  const contiguous = (prev: ts.CommentRange, next: ts.CommentRange): boolean =>
    /^\r?\n[ \t]*$/.test(text.slice(prev.end, next.pos))

  for (let i = 0; i < comments.length; i++) {
    const c = comments[i]
    if (c === undefined) continue
    const indent = leadingWhitespace(text.slice(lineStartOf(text, c.pos), c.pos))

    if (isStandaloneLine(c)) {
      const group = [c]
      let j = i + 1
      let prev = c
      for (; j < comments.length; j++) {
        const next = comments[j]
        if (next === undefined || !isStandaloneLine(next) || !contiguous(prev, next)) break
        if (leadingWhitespace(text.slice(lineStartOf(text, next.pos), next.pos)) !== indent) break
        group.push(next)
        prev = next
      }
      i = j - 1
      const first = group[0]
      const lastC = group[group.length - 1]
      if (first === undefined || lastC === undefined) continue
      const replacement = reflowLineGroup(
        indent,
        group.map((g) => text.slice(g.pos, g.end)),
      )
      const original = text.slice(first.pos, lastC.end)
      if (replacement !== null && replacement !== original) {
        edits.push({ pos: first.pos, end: lastC.end, replacement })
      }
      continue
    }

    const original = text.slice(c.pos, c.end)
    const isTrailing = text.slice(lineStartOf(text, c.pos), c.pos).trim().length > 0
    const replacement =
      c.kind === ts.SyntaxKind.SingleLineCommentTrivia
        ? null
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
