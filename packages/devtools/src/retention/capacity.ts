/** Require a bounded retention capacity to be a positive safe integer. */
export function assertPositiveCapacity(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`)
  }
}
