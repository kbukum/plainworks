// A minimal unified line diff for the registry:diff command. Kept dependency-free so the maintainer
// toolchain carries no supply-chain weight for a review aid; both inputs are already formatted by
// the same pipeline, so a line-level LCS diff never surfaces formatting noise.

/** Longest-common-subsequence edit script over lines: "keep" / "del" / "ins" ops in order. */
function editScript(oldLines, newLines) {
  const m = oldLines.length
  const n = newLines.length
  // length[i][j] = LCS length of oldLines[i:] and newLines[j:].
  const length = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      length[i][j] =
        oldLines[i] === newLines[j]
          ? length[i + 1][j + 1] + 1
          : Math.max(length[i + 1][j], length[i][j + 1])
    }
  }
  const ops = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ kind: "keep", line: oldLines[i] })
      i++
      j++
    } else if (length[i + 1][j] >= length[i][j + 1]) {
      ops.push({ kind: "del", line: oldLines[i] })
      i++
    } else {
      ops.push({ kind: "ins", line: newLines[j] })
      j++
    }
  }
  while (i < m) ops.push({ kind: "del", line: oldLines[i++] })
  while (j < n) ops.push({ kind: "ins", line: newLines[j++] })
  return ops
}

/**
 * Render a unified diff body (hunks only, no `---`/`+++` file headers — the caller owns those)
 * between two texts, with `context` unchanged lines around each change. Returns an empty string
 * when the texts are identical.
 */
export function diffLines(oldText, newText, context = 3) {
  if (oldText === newText) return ""
  const ops = editScript(oldText.split("\n"), newText.split("\n"))
  // Track the 1-based old/new line number at each op so hunk headers stay correct across gaps.
  let oldCursor = 1
  let newCursor = 1
  for (const op of ops) {
    op.oldLine = oldCursor
    op.newLine = newCursor
    if (op.kind !== "ins") oldCursor++
    if (op.kind !== "del") newCursor++
  }
  const changed = ops.map((op, index) => (op.kind === "keep" ? -1 : index)).filter((i) => i >= 0)
  if (changed.length === 0) return ""

  // Group changed ops into hunks that merge when their context windows overlap.
  const hunks = []
  for (const index of changed) {
    const start = Math.max(0, index - context)
    const last = hunks[hunks.length - 1]
    if (last && start <= last.end) {
      last.end = Math.min(ops.length, index + context + 1)
    } else {
      hunks.push({ start, end: Math.min(ops.length, index + context + 1) })
    }
  }

  const out = []
  for (const hunk of hunks) {
    const body = []
    let oldCount = 0
    let newCount = 0
    for (let k = hunk.start; k < hunk.end; k++) {
      const op = ops[k]
      if (op.kind === "keep") {
        body.push(` ${op.line}`)
        oldCount++
        newCount++
      } else if (op.kind === "del") {
        body.push(`-${op.line}`)
        oldCount++
      } else {
        body.push(`+${op.line}`)
        newCount++
      }
    }
    // Unified-diff convention: a hunk that touches zero lines on a side is anchored to the line
    // *before* the change (e.g. a pure insertion after line 1 is `-1,0`).
    const oldStart = ops[hunk.start].oldLine - (oldCount === 0 ? 1 : 0)
    const newStart = ops[hunk.start].newLine - (newCount === 0 ? 1 : 0)
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`, ...body)
  }
  return out.join("\n")
}
