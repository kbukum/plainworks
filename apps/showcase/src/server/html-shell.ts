// The server HTML document shell. It is a plain string template — no host global, no React — so it
// stays in the neutral graph. The resolved theme class is written straight onto `<html>` so the
// very first paint is the user's theme (zero flash). The hydration payload arrives as a finished,
// HTML-safe `<script type="application/json">` block from `@plainworks/app/hydration`.

import { ROOT_ELEMENT_ID } from "../neutral/constants"

/** Everything the shell needs to assemble one server response. */
export interface HtmlShellInput {
  /** The `<html>` class the app resolved — attribute-safe, since `App.htmlClass` validates it. */
  readonly htmlClass: string
  /** The rendered application markup placed inside the root element. */
  readonly appHtml: string
  /** The hydration data block from `renderHydrationScript` (already HTML-safe). */
  readonly hydrationScript: string
  /** Stylesheet URLs loaded in the document head before the browser paints the server markup. */
  readonly stylesheets: readonly string[]
  /** The client entry module URL the browser boots hydration from. */
  readonly clientEntry: string
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
    <title>plainworks showcase</title>
${stylesheetLinks}
  </head>
  <body>
    <div id="${ROOT_ELEMENT_ID}">${input.appHtml}</div>
    ${input.hydrationScript}
    <script type="module" src="${input.clientEntry}"></script>
  </body>
</html>`
}
