/** Error raised for expected bundle-exclusion failures. */
export class BundleExclusionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "BundleExclusionError"
  }
}
