import type { DescMessage } from "@bufbuild/protobuf"
import { type Path, parsePath } from "@bufbuild/protobuf/reflect"
import { FailureDecodeError } from "@plainworks/std/failure"

export function controlName(path: Path): string {
  let name = ""
  for (const part of path) {
    if (part.kind === "field") {
      name += `${name === "" ? "" : "."}${part.jsonName}`
    } else if (part.kind === "list_sub") {
      name += `[${part.index}]`
    } else if (part.kind === "map_sub") {
      name += `[${JSON.stringify(String(part.key))}]`
    } else {
      throw new FailureDecodeError()
    }
  }
  return name
}

export function protobufControlName(schema: DescMessage, field: string): string {
  try {
    return field === "" ? "" : controlName(parsePath(schema, field))
  } catch (cause) {
    throw new FailureDecodeError({ cause })
  }
}
