/** Options for {@link diffAriaSnapshots}. */
export interface AriaDiffOptions {
  /**
   * The most line pairs the diff compares, bounding its memory. Past it, the diff shows the whole
   * old tree removed and the new one added. Defaults to 4 million (two 2,000-line trees).
   */
  readonly maxCells?: number
}

/** How two ARIA snapshots compare. */
export interface AriaDiff {
  readonly changed: boolean
  /** Changed lines as `- old` and `+ new`, with two lines of context; empty when unchanged. */
  readonly diff: string
}

const CONTEXT = 2
const DEFAULT_MAX_CELLS = 4_000_000

type Op = { readonly kind: " " | "-" | "+"; readonly line: string }

/**
 * Compare two ARIA snapshots line by line. A changed role, name, or order shows up here even when
 * the frame looks the same, so it catches a semantic regression the pixels miss.
 */
export function diffAriaSnapshots(
  before: string,
  after: string,
  options: AriaDiffOptions = {},
): AriaDiff {
  const a = lines(before)
  const b = lines(after)
  if (a.length === b.length && a.every((line, i) => line === b[i])) {
    return { changed: false, diff: "" }
  }
  const ops =
    a.length * b.length > (options.maxCells ?? DEFAULT_MAX_CELLS)
      ? [
          ...a.map((line): Op => ({ kind: "-", line })),
          ...b.map((line): Op => ({ kind: "+", line })),
        ]
      : lineOps(a, b)
  return { changed: true, diff: withContext(ops).join("\n") }
}

const lines = (text: string): string[] =>
  text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line, index, all) => line !== "" || index < all.length - 1)

/** The shortest edit from `a` to `b`, by longest common subsequence. */
function lineOps(a: readonly string[], b: readonly string[]): Op[] {
  const width = b.length + 1
  const common = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i * width + j] =
        a[i] === b[j]
          ? (common[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(common[(i + 1) * width + j] ?? 0, common[i * width + j + 1] ?? 0)
    }
  }
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    const left = a[i]
    const right = b[j]
    if (left !== undefined && left === right) {
      ops.push({ kind: " ", line: left })
      i++
      j++
    } else if (
      right === undefined ||
      (left !== undefined && (common[(i + 1) * width + j] ?? 0) >= (common[i * width + j + 1] ?? 0))
    ) {
      ops.push({ kind: "-", line: left ?? "" })
      i++
    } else {
      ops.push({ kind: "+", line: right })
      j++
    }
  }
  return ops
}

/** Keep the changed lines and {@link CONTEXT} lines around each; `…` marks what was left out. */
function withContext(ops: readonly Op[]): string[] {
  const keep = ops.map(() => false)
  ops.forEach((op, index) => {
    if (op.kind === " ") return
    for (let near = index - CONTEXT; near <= index + CONTEXT; near++) {
      if (near >= 0 && near < ops.length) keep[near] = true
    }
  })
  const out: string[] = []
  let skipped = false
  ops.forEach((op, index) => {
    if (!keep[index]) {
      if (!skipped) out.push("  …")
      skipped = true
      return
    }
    skipped = false
    out.push(`${op.kind} ${op.line}`)
  })
  return out
}
