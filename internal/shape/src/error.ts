/** A workspace the shape tool cannot read: a missing or malformed build description or tsconfig. */
export class ShapeError extends Error {
  override readonly name = "ShapeError"
}
