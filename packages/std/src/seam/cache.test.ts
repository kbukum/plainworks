import { describe, expect, test } from "vitest"
import { isSameCacheKey, matchesCacheTarget } from "./cache"

describe("matchesCacheTarget", () => {
  test("matches every key when the target names no key", () => {
    expect(matchesCacheTarget(["users", 1], {})).toBe(true)
    expect(matchesCacheTarget([], { exact: true })).toBe(true)
  })

  test("treats the target key as a prefix by default", () => {
    expect(matchesCacheTarget(["users"], { key: ["users"] })).toBe(true)
    expect(matchesCacheTarget(["users", { id: 1 }], { key: ["users"] })).toBe(true)
    expect(matchesCacheTarget(["posts"], { key: ["users"] })).toBe(false)
    expect(matchesCacheTarget(["users"], { key: ["users", 1] })).toBe(false)
  })

  test("matches an object part by the fields it names", () => {
    const key = ["users", { id: 1, role: "admin" }]
    expect(matchesCacheTarget(key, { key: ["users", { id: 1 }] })).toBe(true)
    expect(matchesCacheTarget(key, { key: ["users", { id: 2 }] })).toBe(false)
    expect(matchesCacheTarget(["users", 1], { key: ["users", { id: 1 }] })).toBe(false)
  })

  test("matches only an equal key when exact", () => {
    expect(matchesCacheTarget(["users"], { key: ["users"], exact: true })).toBe(true)
    expect(matchesCacheTarget(["users", 1], { key: ["users"], exact: true })).toBe(false)
    const target = { key: ["users", { id: 1 }], exact: true }
    expect(matchesCacheTarget(["users", { id: 1, role: "admin" }], target)).toBe(false)
  })

  test("a partial target never mixes arrays and records and is never longer than the entry", () => {
    expect(matchesCacheTarget(["users", { id: 1 }], { key: ["users", []] })).toBe(false)
    expect(matchesCacheTarget(["users", ["a"]], { key: ["users", {}] })).toBe(false)
    expect(matchesCacheTarget(["users", ["a"]], { key: ["users", { 0: "a" }] })).toBe(false)
    expect(matchesCacheTarget(["users"], { key: ["users", undefined] })).toBe(false)
    expect(
      matchesCacheTarget(["users", { role: "admin" }], { key: ["users", { filter: undefined }] }),
    ).toBe(true)
  })

  test("isSameCacheKey is the exact rule", () => {
    expect(isSameCacheKey(["users", { id: 1, x: undefined }], ["users", { id: 1 }])).toBe(true)
    expect(isSameCacheKey(["users", { id: 1 }], ["users", { id: 2 }])).toBe(false)
    expect(isSameCacheKey(["users", "1"], ["users", 1])).toBe(false)
  })

  test("treats a field set to undefined as absent, as serialized keys do", () => {
    expect(
      matchesCacheTarget(["users", { id: undefined }], { key: ["users", {}], exact: true }),
    ).toBe(true)
    expect(
      matchesCacheTarget(["users", {}], { key: ["users", { id: undefined }], exact: true }),
    ).toBe(true)
    expect(
      matchesCacheTarget(["users", { a: undefined }], { key: ["users", { b: 1 }], exact: true }),
    ).toBe(false)
    expect(matchesCacheTarget(["users", []], { key: ["users", {}], exact: true })).toBe(false)
    expect(matchesCacheTarget(["users", [undefined]], { key: ["users", []], exact: true })).toBe(
      false,
    )
  })
})
