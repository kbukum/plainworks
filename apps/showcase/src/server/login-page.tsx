// The signed-out landing page the dev host serves at `GET /login`. It exists so logout lands on a
// real signed-out screen: the mock IdP approves in-process, so without an explicit "Sign in" step
// the session gate would bounce straight back through it and re-authenticate. The button POSTs back
// to `/login`, and that POST is where the OIDC redirect begins.
//
// It is static markup built from the kit's own atoms and theme, so it matches the app, follows the
// persisted color mode on first paint, and ships no client JavaScript. React escapes every value,
// so a return target lifted from the query string cannot break out of the markup.

import { Button } from "@plainworks/elements/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@plainworks/elements/card"
import { DEFAULT_THEME, parseThemeCookie } from "@plainworks/theme"
import type { ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { LOGIN_PATH, THEME_COOKIE } from "../app/constants"
import { resolveHtmlClass } from "../app/theme"

/** Everything the login page needs for one response. */
export interface LoginPageInput {
  /** The sanitized path to return to after sign-in. */
  readonly returnTo: string
  /** The request's `Cookie` header, read for the persisted theme. */
  readonly cookieHeader: string
  /** Stylesheet URLs, the same ones the app document loads. */
  readonly stylesheets: readonly string[]
}

function LoginDocument({ returnTo, cookieHeader, stylesheets }: LoginPageInput): ReactElement {
  const htmlClass = resolveHtmlClass(parseThemeCookie(cookieHeader, THEME_COOKIE, DEFAULT_THEME))
  return (
    <html lang="en" className={htmlClass}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Sign in · plainworks showcase</title>
        {stylesheets.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
      </head>
      <body className="bg-muted/40 text-foreground">
        <main className="grid min-h-dvh place-items-center p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>
                <h1 className="text-title">Sign in to plainworks</h1>
              </CardTitle>
              <CardDescription>You are signed out. Sign in to open the showcase.</CardDescription>
            </CardHeader>
            <CardContent>
              <form method="post" action={LOGIN_PATH}>
                <input type="hidden" name="returnTo" value={returnTo} />
                <Button type="submit" size="lg" className="w-full">
                  Sign in
                </Button>
              </form>
            </CardContent>
          </Card>
        </main>
      </body>
    </html>
  )
}

/** Render the signed-out landing page as a complete HTML document. */
export function renderLoginPage(input: LoginPageInput): string {
  return `<!doctype html>${renderToStaticMarkup(<LoginDocument {...input} />)}`
}
