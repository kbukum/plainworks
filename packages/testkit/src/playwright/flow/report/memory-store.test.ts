import { describe, expect, it } from "vitest"
import { memoryArtifactStore } from "./memory-store"

describe("memoryArtifactStore", () => {
  it("reads text and bytes back, and lists a directory's direct children", async () => {
    const store = memoryArtifactStore()
    await store.write("/a/b/one.txt", "hi")
    await store.write("/a/two.png", Uint8Array.of(1, 2))
    expect(await store.read("/a/b/one.txt")).toBe("hi")
    expect(await store.readBytes("/a/two.png")).toEqual(Uint8Array.of(1, 2))
    expect(await store.list("/a")).toEqual(["b", "two.png"])
    expect(await store.list("/missing")).toEqual([])
    expect(await store.size("/a")).toBe(4)
    await expect(store.read("/a/none")).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("creates a directory once, and copies a tree over whatever the target held", async () => {
    const store = memoryArtifactStore()
    expect(await store.createDir("/runs/r1")).toBe(true)
    expect(await store.createDir("/runs/r1")).toBe(false)
    await store.write("/runs/r1/report.json", "{}")
    await store.write("/snap/stale.txt", "old")
    await store.copy("/runs/r1", "/snap")
    expect([...store.files.keys()].sort()).toEqual(["/runs/r1/report.json", "/snap/report.json"])
    expect(store.dirs.has("/snap")).toBe(true)
  })

  it("removes a file or a tree, links, and refuses a cancelled write", async () => {
    const store = memoryArtifactStore()
    await store.write("/x/y.txt", "1")
    await store.remove("/x")
    expect(store.files.size).toBe(0)
    await store.link("runs/r1", "/latest")
    expect(store.links.get("/latest")).toBe("runs/r1")
    const controller = new AbortController()
    controller.abort()
    await expect(store.write("/z", "1", controller.signal)).rejects.toThrow()
  })
})
