// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { afterEach, describe, expect, it } from "vitest"
import { THEME_COOKIE } from "../app/constants"
import { renderLoginPage } from "./login-page"

const STYLES = ["/src/client/styles.css"]

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html")
}

afterEach(() => {
  document.body.replaceChildren()
})

describe("renderLoginPage", () => {
  it("renders a themed, styled document with the persisted mode on first paint", () => {
    const html = renderLoginPage({
      returnTo: "/tasks",
      cookieHeader: `${THEME_COOKIE}=${encodeURIComponent(JSON.stringify({ mode: "dark", colorScheme: "emerald" }))}`,
      stylesheets: STYLES,
    })

    expect(html.startsWith("<!doctype html>")).toBe(true)
    const doc = parse(html)
    expect(doc.documentElement.classList.contains("dark")).toBe(true)
    expect(doc.documentElement.getAttribute("lang")).toBe("en")
    expect(doc.querySelector('link[rel="stylesheet"]')?.getAttribute("href")).toBe(STYLES[0])
    expect(doc.querySelectorAll("script")).toHaveLength(0)
  })

  it("offers one sign-in action that posts the sanitized return target", () => {
    const doc = parse(
      renderLoginPage({ returnTo: "/orders", cookieHeader: "", stylesheets: STYLES }),
    )

    expect(doc.querySelector("main h1")?.textContent).toBe("Sign in to plainworks")
    const form = doc.querySelector("form")
    expect(form?.getAttribute("method")).toBe("post")
    expect(form?.getAttribute("action")).toBe("/login")
    expect(doc.querySelector<HTMLInputElement>('input[name="returnTo"]')?.value).toBe("/orders")
    expect(doc.querySelector('button[type="submit"]')?.textContent).toBe("Sign in")
  })

  it("has no detectable accessibility violations", async () => {
    const doc = parse(renderLoginPage({ returnTo: "/", cookieHeader: "", stylesheets: STYLES }))
    document.documentElement.lang = doc.documentElement.lang
    document.body.replaceChildren(
      ...Array.from(doc.body.childNodes, (node) => document.adoptNode(node)),
    )
    await expectNoAxeViolations(document.body)
  })

  it("never lets the return target break out of the markup", () => {
    const hostile = '"><script>alert(1)</script>'
    const html = renderLoginPage({ returnTo: hostile, cookieHeader: "", stylesheets: STYLES })
    const doc = parse(html)

    expect(doc.querySelectorAll("script")).toHaveLength(0)
    expect(doc.querySelector<HTMLInputElement>('input[name="returnTo"]')?.value).toBe(hostile)
  })
})
