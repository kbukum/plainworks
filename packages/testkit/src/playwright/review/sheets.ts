import { type FlowRunWriter, flowArtifactPaths } from "../flow/report/artifacts"
import type { ChangeReview, ContactSheets, FlowReport, FrameChange } from "../flow/report/schema"

/** One sheet to render: its HTML file, and the PNG to write. Both are absolute paths. */
export interface SheetTarget {
  readonly html: string
  readonly png: string
}

/** Turn a written HTML sheet into a PNG, such as with a headless browser. */
export type SheetRenderer = (sheet: SheetTarget, signal?: AbortSignal) => Promise<void>

/** Options for {@link writeContactSheets}. */
export interface ContactSheetOptions {
  readonly report: FlowReport
  readonly review?: ChangeReview
  readonly writer: FlowRunWriter
  /** Renders each sheet to a PNG. Without one, the sheets stay HTML. */
  readonly render?: SheetRenderer
  readonly signal?: AbortSignal
}

/**
 * Write the run's contact sheets: one labeled grid of every variant per checkpoint and device,
 * and, when a review found changes, one sheet of only those, each as before, after, and diff. A
 * reviewer looks at one image per checkpoint instead of every frame. Sheets are static HTML with
 * no script; with a renderer, each also becomes a PNG, and the PNGs are what the report lists.
 */
export async function writeContactSheets(options: ContactSheetOptions): Promise<ContactSheets> {
  const { report, review, writer, render, signal } = options
  const changes = review?.status === "compared" ? review.changes : []
  const changedAt = new Map(changes.map((change) => [key(change), change.status]))
  const finish = async (html: string): Promise<string> => {
    if (render === undefined) return html
    const png = html.replace(/\.html$/, ".png")
    await render({ html: `${writer.dir}/${html}`, png: `${writer.dir}/${png}` }, signal)
    return png
  }

  const written: string[] = []
  for (const run of report.runs) {
    for (const checkpoint of run.checkpoints) {
      const cells = checkpoint.variants.flatMap((variant) =>
        variant.frame === undefined
          ? []
          : [
              {
                label: variant.id,
                src: variant.frame,
                status:
                  changedAt.get(
                    key({ ...run, checkpoint: checkpoint.name, variant: variant.id }),
                  ) ?? "unchanged",
              },
            ],
      )
      if (cells.length === 0) continue
      const at = {
        flow: run.flow,
        device: run.device,
        index: checkpoint.index,
        checkpoint: checkpoint.name,
      }
      const title = `${run.flow} › ${run.device} › ${step(checkpoint.index)} ${checkpoint.name}`
      written.push(
        await writer.write(flowArtifactPaths.sheet(at), checkpointSheet(title, cells), signal),
      )
    }
  }
  const checkpoints: string[] = []
  for (const html of written) checkpoints.push(await finish(html))
  if (changes.length === 0) return { checkpoints }
  const changed = await writer.write(flowArtifactPaths.changedSheet, changedSheet(changes), signal)
  return { checkpoints, changed: await finish(changed) }
}

const key = (at: { flow: string; device: string; checkpoint: string; variant: string }) =>
  `${at.flow}/${at.device}/${at.checkpoint}/${at.variant}`

const step = (index: number): string => String(index + 1).padStart(2, "0")

// Sheets live in `sheets/`, one level below the run, where every other path is rooted.
const fromSheet = (path: string): string => `../${path}`

const ENTITIES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char)

const STYLE = `
  body { margin: 0; padding: 16px; font: 14px/1.4 system-ui, sans-serif; background: #fff; color: #111; }
  h1 { margin: 0 0 12px; font-size: 18px; }
  .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
  .row { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-bottom: 16px; }
  figure { margin: 0; border: 3px solid #d4d4d4; background: #fafafa; }
  figure[data-status="changed"], figure[data-status="added"] { border-color: #c2410c; }
  figure[data-status="removed"] { border-color: #6d28d9; }
  figcaption { padding: 4px 6px; font-weight: 600; overflow-wrap: anywhere; }
  img { display: block; width: 100%; height: auto; }
  .missing { padding: 24px 6px; color: #525252; }
`

const page = (title: string, body: string): string =>
  `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head>
<body><h1>${escapeHtml(title)}</h1>
${body}
</body>
</html>
`

const figure = (label: string, src: string | undefined, status: string): string =>
  `<figure data-status="${escapeHtml(status)}"><figcaption>${escapeHtml(label)}</figcaption>${
    src === undefined
      ? '<div class="missing">none</div>'
      : `<img src="${escapeHtml(fromSheet(src))}" alt="${escapeHtml(label)}">`
  }</figure>`

function checkpointSheet(
  title: string,
  cells: readonly { label: string; src: string; status: string }[],
): string {
  const grid = cells
    .map((cell) =>
      figure(
        cell.status === "unchanged" ? cell.label : `${cell.label} (${cell.status})`,
        cell.src,
        cell.status,
      ),
    )
    .join("\n")
  return page(title, `<div class="grid">\n${grid}\n</div>`)
}

function changedSheet(changes: readonly FrameChange[]): string {
  const rows = changes.map((change) => {
    const label = `${change.flow} › ${change.device} › ${step(change.index)} ${change.checkpoint} › ${change.variant}`
    return `<h2>${escapeHtml(`${label} (${change.status})`)}</h2>
<div class="row">${[
      figure("before", change.before, change.status),
      figure("after", change.after, change.status),
      figure("diff", change.diff, change.status),
    ].join("")}</div>`
  })
  return page(`Changed frames (${changes.length})`, rows.join("\n"))
}
