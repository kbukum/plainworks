import { MethodSchema } from "@bufbuild/protobuf/wkt"
import { problemFrame, problemJson } from "@plainworks/mocks/failure"
import { protocolFixture } from "@plainworks/mocks/stream"
import type { StreamFrame } from "@plainworks/std/seam"
import { fakeFetch } from "@plainworks/testkit/fakes"
import { describe, expect, it } from "vitest"
import { decodeFailureFrame, protobufDecoder } from "../events"
import { validateControl } from "../events/control"
import { createSseTransport } from "./sse"

describe("channel event wire", () => {
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
        expect(() => validateControl(frame, decodeFailureFrame)).not.toThrow()
      }
    },
  )

  it.each([
    { status: 401, code: "unauthenticated", retryable: false },
    { status: 503, code: "unavailable", retryable: true },
  ])("decodes a complete $status in-stream failure", async ({ status, code, retryable }) => {
    const fake = fakeFetch([
      new Response(problemFrame(status, { detail: "Stream failed." }), {
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
          validateControl(frame, decodeFailureFrame)
        } catch (error) {
          failure = error
        }
      },
    })
    expect(failure).toMatchObject({ code, message: "Stream failed.", retryable })
  })

  it.each([{}, { status: 200 }, { status: "401" }])(
    "rejects a failure frame without an error status: %j",
    (data) => {
      expect(() =>
        validateControl({ type: "failure", data: JSON.stringify(data) }, decodeFailureFrame),
      ).toThrow(expect.objectContaining({ kind: "channel/protocol" }))
    },
  )

  it.each(protocolFixture.cases.filter((fixture) => fixture.status === 422))(
    "surfaces pre-stream $name as a typed HTTP failure",
    async (fixture) => {
      const fake = fakeFetch([
        new Response(JSON.stringify(problemJson(422, { detail: "Invalid cursor." })), {
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
      ).rejects.toMatchObject({
        code: "invalid_argument",
        message: "Invalid cursor.",
        status: 422,
        retryable: false,
      })
    },
  )
})
