// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { createEvidenceLog, snapshotDom, withoutQuery } from "./evidence"

describe("createEvidenceLog", () => {
  it("keeps only the most recent entries", () => {
    const log = createEvidenceLog<number>(3)
    for (const value of [1, 2, 3, 4, 5]) log.remember(value)
    expect(log.entries).toEqual([3, 4, 5])
  })
})

describe("withoutQuery", () => {
  it("drops the query and fragment, where a careless app might put a secret", () => {
    expect(withoutQuery("https://app.test/api/tasks?token=secret#frag")).toBe(
      "https://app.test/api/tasks",
    )
  })

  it("never echoes a URL it cannot parse", () => {
    expect(withoutQuery("not a url ?token=secret")).toBe("(unparsable url)")
  })
})

describe("snapshotDom", () => {
  const page = (body: string): void => {
    document.documentElement.innerHTML = `<head><meta http-equiv="refresh" content="0;url=https://evil.test"><title>t</title></head><body>${body}</body>`
  }

  it("saves an inert copy: no scripts, no redirects, and a policy that blocks script", () => {
    page(
      `<script src="https://cdn.test/app.js"></script><script>alert(1)</script><button onclick="alert(2)">Go</button>`,
    )
    const html = snapshotDom(1_000_000)
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toContain("refresh")
    expect(html).toMatch(
      /<head><meta http-equiv="Content-Security-Policy" content="[^"]*script-src 'none'/,
    )
    expect(html).toContain("<button")
  })

  it("drops hidden and password field values", () => {
    page(`<input type="password" value="hunter2"><input type="hidden" value="csrf">`)
    const html = snapshotDom(1_000_000)
    expect(html).not.toContain("hunter2")
    expect(html).not.toContain("csrf")
  })

  it("leaves the live page untouched", () => {
    page(`<script>window.live = 1</script>`)
    snapshotDom(1_000_000)
    expect(document.querySelectorAll("script")).toHaveLength(1)
  })

  it("cuts a snapshot past the cap and marks the cut", () => {
    page(`<p>${"x".repeat(5_000)}</p>`)
    const html = snapshotDom(1_000)
    expect(html).toMatch(/<!-- cut at 1000 chars -->\n$/)
    expect(html.length).toBeLessThan(1_100)
  })
})
