import { PassThrough, Writable } from "node:stream"
import { describe, expect, it } from "vitest"
import { pipeOutput } from "./node-runtime"

function slowLog() {
  const pending: (() => void)[] = []
  const written: string[] = []
  const log = new Writable({
    highWaterMark: 1,
    write(chunk: Buffer, _encoding, done) {
      written.push(chunk.toString("utf8"))
      pending.push(done)
    },
  })
  const release = (): void => {
    for (const done of pending.splice(0)) done()
  }
  return { log, written, release }
}

describe("pipeOutput", () => {
  it("pauses every source while the log is full and resumes them on drain", async () => {
    const { log, written, release } = slowLog()
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const seen: string[] = []
    pipeOutput([stdout, stderr], log, (chunk) => seen.push(chunk.toString("utf8")))

    stdout.write("a")
    await new Promise((resolve) => setImmediate(resolve))
    expect(stdout.isPaused()).toBe(true)
    expect(stderr.isPaused()).toBe(true)

    stderr.write("b")
    await new Promise((resolve) => setImmediate(resolve))
    expect(seen).toEqual(["a"])

    release()
    await new Promise((resolve) => setImmediate(resolve))
    release()
    await new Promise((resolve) => setImmediate(resolve))
    expect(stdout.isPaused()).toBe(false)
    expect(stderr.isPaused()).toBe(false)
    expect(seen).toEqual(["a", "b"])
    expect(written).toEqual(["a", "b"])
  })

  it("records output without a log", () => {
    const stdout = new PassThrough()
    const seen: string[] = []
    pipeOutput([stdout], undefined, (chunk) => seen.push(chunk.toString("utf8")))
    stdout.write("a")
    stdout.write("b")
    return new Promise<void>((resolve) =>
      setImmediate(() => {
        expect(seen).toEqual(["a", "b"])
        resolve()
      }),
    )
  })
})
