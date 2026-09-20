// The server HTML document shell. It is a plain string template — no host global, no React — so it
// stays in the neutral graph. The resolved theme class is written straight onto `<html>` so the
// very first paint is the user's theme (zero flash), and the serialized snapshot plus the
// dehydrated query cache ride inline `<script type="application/json">` blocks the client reads
// back on hydration. Both JSON payloads are embedded with `<` escaped so a value can never close
// the script element early.

import { QUERY_STATE_SCRIPT_ID, ROOT_ELEMENT_ID, SNAPSHOT_SCRIPT_ID } from "../app/constants"

/** Everything the shell needs to assemble one server response. */
export interface HtmlShellInput {
  /** The `<html>` class the theme resolver produced — applied before paint for zero flash. */
  readonly htmlClass: string
  /** The rendered application markup placed inside the root element. */
  readonly appHtml: string
  /** The serialized {@link import("@plainworks/app").AppSnapshot} (already HTML-safe). */
  readonly snapshotJson: string
  /** The JSON-encoded dehydrated query cache. */
  readonly queryJson: string
  /** Stylesheet URLs loaded in the document head before the browser paints the server markup. */
  readonly stylesheets: readonly string[]
  /** The client entry module URL the browser boots hydration from. */
  readonly clientEntry: string
}

// A value embedded in a `<script>` must not contain a literal `</script>` or an HTML comment
// opener; escaping `<` to its unicode form keeps the JSON valid while making that impossible.
function embedJson(json: string): string {
  return json.replace(/</g, "\\u003c")
}

/** Assemble the full HTML document for one SSR response. */
export function renderHtmlShell(input: HtmlShellInput): string {
  const stylesheetLinks = input.stylesheets
    .map((href) => `    <link rel="stylesheet" href="${href}" />`)
    .join("\n")

  return `<!doctype html>
<html lang="en" class="${input.htmlClass}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>plainworks reference dashboard</title>
${stylesheetLinks}
  </head>
  <body>
    <div id="${ROOT_ELEMENT_ID}">${input.appHtml}</div>
    <script type="application/json" id="${SNAPSHOT_SCRIPT_ID}">${embedJson(input.snapshotJson)}</script>
    <script type="application/json" id="${QUERY_STATE_SCRIPT_ID}">${embedJson(input.queryJson)}</script>
    <script type="module" src="${input.clientEntry}"></script>
  </body>
</html>`
}
