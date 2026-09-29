/** Require a bounded retention capacity to be a positive safe integer. */
import { isPositiveInteger } from "@plainworks/std"

export function assertPositiveCapacity(label: string, value: number): void {
  if (!isPositiveInteger(value)) {
    throw new RangeError(`${label} must be a positive safe integer.`)
  }
}
