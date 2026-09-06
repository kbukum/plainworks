import { expect, test } from "vitest"
import { fakeFetch } from "./http"

test("plays back queued outcomes in order and records each call", async () => {
  const first = new Response("1")
  const second = new Response("2")
  const { fetch, calls } = fakeFetch([first, second])

  await expect(fetch("https://api.test/a")).resolves.toBe(first)
  await expect(fetch("https://api.test/b", { method: "POST" })).resolves.toBe(second)
  expect(calls).toEqual([
    { url: "https://api.test/a", init: undefined },
    { url: "https://api.test/b", init: { method: "POST" } },
  ])
})

test("repeats the last outcome once the queue is exhausted", async () => {
  const only = new Response("ok")
  const { fetch, calls } = fakeFetch([only])

  await expect(fetch("https://api.test/1")).resolves.toBe(only)
  await expect(fetch("https://api.test/2")).resolves.toBe(only)
  expect(calls).toHaveLength(2)
})

test("rejects with an Error outcome", async () => {
  const boom = new Error("network down")
  const { fetch } = fakeFetch([boom])

  await expect(fetch("https://api.test")).rejects.toBe(boom)
})

test("never settles a hanging outcome", async () => {
  const { fetch } = fakeFetch(["hang"])
  const settled = await Promise.race([
    fetch("https://api.test").then(() => "settled"),
    Promise.resolve("pending"),
  ])

  expect(settled).toBe("pending")
})
