/** Error raised for expected comment-format failures. */
export class CommentFormatError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "CommentFormatError"
  }
}
