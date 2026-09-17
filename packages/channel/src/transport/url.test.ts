import { describe, expect, test } from "vitest"
import { ChannelError } from "../error"
import { resolveUrl } from "./url"

const signal = new AbortController().signal

describe("resolveUrl", () => {
  test("returns a fixed string unchanged", async () => {
    expect(await resolveUrl("https://example.test/s", signal)).toBe("https://example.test/s")
  })

  test("invokes a provider on each call, passing the attempt signal", async () => {
    let n = 0
    const signals: unknown[] = []
    const url = ({ signal: attemptSignal }: { signal: unknown }) => {
      signals.push(attemptSignal)
      return `https://example.test/s?n=${++n}`
    }
    expect(await resolveUrl(url, signal)).toBe("https://example.test/s?n=1")
    expect(await resolveUrl(url, signal)).toBe("https://example.test/s?n=2")
    expect(signals).toEqual([signal, signal])
  })

  test("wraps a provider failure as a config error", async () => {
    const url = () => {
      throw new Error("no signer")
    }
    await expect(resolveUrl(url, signal)).rejects.toBeInstanceOf(ChannelError)
    await expect(resolveUrl(url, signal)).rejects.toMatchObject({ kind: "channel/config" })
  })
})
