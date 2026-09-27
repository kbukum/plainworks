/** A release-tooling failure the maintainer must fix before versioning or publishing. */
export class ReleaseToolError extends Error {
  override readonly name = "ReleaseToolError"
}
