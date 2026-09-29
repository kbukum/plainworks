import { readCookie } from "@plainworks/std/web"
import type { AuthNavigator } from "../client/navigation"

const DEFAULT_CSRF_COOKIE_NAME = "__Host-csrf"

/** Options for {@link createFormPostNavigator}. */
export interface FormPostNavigatorOptions {
  /** The cookie the server issues the CSRF token in. Defaults to `__Host-csrf`. */
  readonly csrfCookieName?: string
}

function readDocumentCookie(name: string): string | undefined {
  const raw = readCookie(document.cookie, name)
  if (raw === undefined) return undefined
  try {
    return decodeURIComponent(raw)
  } catch {
    // Not percent-encoded by the server: the raw value is the token.
    return raw
  }
}

function submitForm(url: string, fields: Readonly<Record<string, string>>): void {
  const form = document.createElement("form")
  form.method = "POST"
  form.action = url
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input")
    input.type = "hidden"
    input.name = name
    input.value = value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
}

/**
 * Build the browser {@link AuthNavigator}: `location.assign` for login, a hidden-form POST for
 * logout, and the CSRF token read from the server's `__Host-` cookie. Host access happens only when
 * a method runs, so importing or building it during SSR touches nothing.
 */
export function createFormPostNavigator(options: FormPostNavigatorOptions = {}): AuthNavigator {
  const csrfCookieName = options.csrfCookieName ?? DEFAULT_CSRF_COOKIE_NAME
  return {
    navigate: (url) => location.assign(url),
    submit: submitForm,
    currentPath: () => `${location.pathname}${location.search}${location.hash}`,
    csrfToken: () => readDocumentCookie(csrfCookieName),
  }
}

/** The browser navigator with the default `__Host-csrf` cookie. */
export const formPostNavigator: AuthNavigator = createFormPostNavigator()
