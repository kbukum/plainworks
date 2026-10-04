import { expect, test } from "vitest"
import { parseRfc3339 } from "./rfc3339"

test("RFC3339 validates calendar dates rather than normalizing invalid dates", () => {
  for (const value of [
    "2024-02-29T00:00:00Z",
    "2000-02-29T00:00:00Z",
    "2026-04-30T00:00:00Z",
    "2026-01-31T00:00:00.123+01:00",
    "0000-02-29T00:00:00Z",
  ])
    expect(parseRfc3339(value)).toBe(Date.parse(value))
  for (const value of [
    "never",
    "2026-02-29T00:00:00Z",
    "1900-02-29T00:00:00Z",
    "2026-04-31T00:00:00Z",
    "2026-01-01T24:00:00Z",
    "2026-00-01T00:00:00Z",
    "2026-13-01T00:00:00Z",
    "2026-01-00T00:00:00Z",
    "2026-01-01T00:00:00Z\n",
    "2026-01-01T00:00:60Z",
    "x".repeat(129),
  ])
    expect(parseRfc3339(value)).toBeUndefined()
})
