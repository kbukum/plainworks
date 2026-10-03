import type { DescMessage, MessageShape } from "@bufbuild/protobuf"
import { createValidator, type Validator } from "@bufbuild/protovalidate"
import { FailureDecodeError } from "@plainworks/std/failure"
import type { FormSchema } from "@plainworks/std/seam"
import { controlName, protobufControlName } from "./field-path"
import { decodeFormValues, FormValueError } from "./form-values"
import { violationReason } from "./violation-reason"

/** A request-descriptor adapter for Form; validators are instance-owned and replaceable in tests. */
export function createProtobufForm<D extends DescMessage>(
  schema: D,
  validator: Validator = createValidator(),
): FormSchema<MessageShape<D>> {
  return {
    fieldName: (field, format) =>
      format === "protobuf" ? protobufControlName(schema, field) : field,
    "~standard": {
      version: 1,
      vendor: "plainworks/protovalidate",
      validate(input) {
        let message: MessageShape<D>
        try {
          message = decodeFormValues(schema, input)
        } catch (error) {
          if (!(error instanceof FormValueError)) throw error
          return {
            issues: [
              {
                path: error.field === "" ? [] : [error.field],
                reason: "INVALID_FORMAT",
                message: error.message,
              },
            ],
          }
        }
        const result = validator.validate(schema, message)
        if (result.kind === "error") throw new FailureDecodeError({ cause: result.error })
        if (result.kind === "valid") return { value: message }
        return {
          issues: result.violations.map((violation) => {
            const field = controlName(violation.field)
            return {
              path: field === "" ? [] : [field],
              message: violation.message,
              reason: violationReason(violation.ruleId),
            }
          }),
        }
      },
    },
  }
}
