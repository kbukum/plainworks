import { MethodSchema } from "@bufbuild/protobuf/wkt"
import { wireFailures } from "@plainworks/mocks/failure"
import { protocolFixture } from "@plainworks/mocks/stream"
import type { StreamFrame } from "@plainworks/std/seam"
import { fakeFetch } from "@plainworks/testkit/fakes"
import { describe, expect, it } from "vitest"
import { protobufDecoder } from "../events"
import { validateControl } from "../events/control"
import { createSseTransport } from "./sse"

describe("published gokit event wire", () => {
  it.each(protocolFixture.cases.filter((fixture) => fixture.status === 200))(
    "decodes $name",
    async (fixture) => {
      const frames: StreamFrame[] = []
      const fake = fakeFetch([
        new Response(fixture.wire, {
          headers: { "content-type": "text/event-stream" },
        }),
      ])
      await createSseTransport({ url: "https://events.test", fetch: fake.fetch })().open({
        headers: {},
        signal: new AbortController().signal,
        onOpen() {},
        onFrame: (frame) => frames.push(frame),
      })
      expect(frames).toHaveLength(1)
      const frame = frames[0]
      if (frame === undefined) throw new Error("Missing fixture frame")
      if (frame.type === MethodSchema.typeName) {
        expect(protobufDecoder(MethodSchema)(frame)?.data).toMatchObject({ name: "visible" })
      } else {
        expect(() => validateControl(frame)).not.toThrow()
      }
    },
  )

  it.each(wireFailures)("decodes the complete $file in-stream failure", async ({ wire }) => {
    const fake = fakeFetch([
      new Response(wire.sseFrame, {
        headers: { "content-type": "text/event-stream" },
      }),
    ])
    let failure: unknown
    await createSseTransport({ url: "https://events.test", fetch: fake.fetch })().open({
      headers: {},
      signal: new AbortController().signal,
      onOpen() {},
      onFrame: (frame) => {
        try {
          validateControl(frame)
        } catch (error) {
          failure = error
        }
      },
    })
    expect(failure).toMatchObject({
      code: wire.vocabulary.code,
      message: wire.vocabulary.message,
      retryable: wire.vocabulary.retryable,
    })
    if ("retryAfterMs" in wire.vocabulary && wire.vocabulary.retryable) {
      expect(failure).toHaveProperty("retryAfterMs", wire.vocabulary.retryAfterMs)
    }
  })

  it.each(protocolFixture.cases.filter((fixture) => fixture.status === 422))(
    "surfaces pre-stream $name as a typed HTTP failure",
    async (fixture) => {
      const invalid = wireFailures.find(({ wire }) => wire.vocabulary.code === "INVALID_INPUT")
      if (invalid === undefined) throw new Error("Missing invalid-input fixture")
      const fake = fakeFetch([
        new Response(JSON.stringify(invalid.wire.problemJson), {
          status: fixture.status,
          headers: { "content-type": "application/problem+json" },
        }),
      ])
      await expect(
        createSseTransport({ url: "https://events.test", fetch: fake.fetch })().open({
          headers: {},
          lastEventId: fixture.cursor,
          signal: new AbortController().signal,
          onOpen: () => {
            throw new Error("Rejection must precede open")
          },
          onFrame() {},
        }),
      ).rejects.toMatchObject({ code: "INVALID_INPUT", status: 422, retryable: false })
    },
  )
})
