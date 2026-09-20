// The signed-out landing page the dev host serves at `GET /login`. A plain HTML string — no React,
// no host global — so it stays in the neutral graph like the document shell. It exists so logout
// lands on a real signed-out screen: the mock IdP approves in-process, so without an explicit
// "Sign in" step the session gate would bounce straight back through it and re-authenticate. The
// button POSTs back to `/login`, and that POST is where the OIDC redirect actually begins.

import { LOGIN_PATH } from "../app/constants"

// Escape a value for an HTML attribute/text context so a return target lifted from the query string
// can never break out of the markup it is embedded in.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Render the signed-out landing page, carrying the sanitized return target through the hidden field
 * so an explicit sign-in returns the caller to where they were headed.
 */
export function renderLoginPage(returnTo: string): string {
  const safeReturnTo = escapeHtml(returnTo)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sign in · plainworks reference dashboard</title>
    <style>
      :root {
        color-scheme: light dark;
        --page: #f4f4f5;
        --card: #ffffff;
        --ink: #18181b;
        --muted: #52525b;
        --accent: #1d4ed8;
        --accent-ink: #ffffff;
        --ring: #1d4ed8;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --page: #09090b;
          --card: #18181b;
          --ink: #fafafa;
          --muted: #a1a1aa;
          --accent: #3b82f6;
          --accent-ink: #0b1120;
          --ring: #93c5fd;
        }
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 1.5rem;
        background: var(--page);
        color: var(--ink);
        font-family:
          system-ui,
          -apple-system,
          "Segoe UI",
          sans-serif;
      }
      main {
        width: min(24rem, 100%);
        padding: clamp(1.5rem, 5vw, 2.5rem);
        background: var(--card);
        border-radius: 0.75rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
        text-align: center;
      }
      h1 {
        margin: 0 0 0.5rem;
        font-size: clamp(1.25rem, 4vw, 1.5rem);
        line-height: 1.2;
      }
      p {
        margin: 0 0 1.5rem;
        color: var(--muted);
        line-height: 1.5;
      }
      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 2.75rem;
        width: 100%;
        padding: 0 1.25rem;
        font: inherit;
        font-weight: 600;
        color: var(--accent-ink);
        background: var(--accent);
        border: none;
        border-radius: 0.5rem;
        cursor: pointer;
      }
      button:hover {
        filter: brightness(1.05);
      }
      button:focus-visible {
        outline: 3px solid var(--ring);
        outline-offset: 2px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>plainworks reference dashboard</h1>
      <p>You are signed out. Sign in to open the dashboard.</p>
      <form method="POST" action="${LOGIN_PATH}">
        <input type="hidden" name="returnTo" value="${safeReturnTo}" />
        <button type="submit">Sign in</button>
      </form>
    </main>
  </body>
</html>`
}
