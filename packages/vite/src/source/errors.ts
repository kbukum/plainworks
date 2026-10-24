import { PlainError } from "@plainworks/std"

/** Why a source link could not be used. */
export type SourceLinkErrorKind =
  | "vite/checkout-missing"
  | "vite/manifest-invalid"
  | "vite/subpath-unknown"

/** The checkout cannot serve a kit import, so the link fails instead of falling back to `dist`. */
export class SourceLinkError extends PlainError<SourceLinkErrorKind> {
  override readonly name: string = "SourceLinkError"
}
