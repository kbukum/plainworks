import { type DescMessage, fromJsonString, type MessageShape } from "@bufbuild/protobuf"
import type { PlainEvent } from "@plainworks/std/seam"
import { ChannelError } from "../errors"
import { parseEventCursor } from "./cursor"
import type { EventDecoder } from "./event"

/** Decode proto JSON by its generated descriptor and full message name, without app-side mapping. */
export function protobufDecoder<Schema extends DescMessage>(
  schema: Schema,
): EventDecoder<PlainEvent<Schema["typeName"], MessageShape<Schema>>> {
  return (frame) => {
    if (frame.type !== schema.typeName) return undefined
    if (frame.id === undefined) throw ChannelError.protocol("Application event has no cursor.")
    parseEventCursor(frame.id)
    try {
      return { type: schema.typeName, data: fromJsonString(schema, frame.data) }
    } catch (cause) {
      throw ChannelError.protocol("Invalid protobuf event.", { cause })
    }
  }
}
