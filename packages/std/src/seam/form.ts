import type { StandardSchemaV1 } from "./schema"

/** A schema may bind a server path to its control name without application mapping. */
export interface FormSchema<Output> extends StandardSchemaV1<unknown, Output> {
  readonly fieldName?: (field: string, format: "protobuf" | "json") => string
}
