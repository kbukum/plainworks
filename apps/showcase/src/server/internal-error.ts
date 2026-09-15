interface InternalErrorResponse {
  readonly headersSent: boolean
  statusCode: number
  setHeader(name: string, value: string): void
  end(body: string): void
}

export function respondWithInternalError(response: InternalErrorResponse): void {
  if (!response.headersSent) {
    response.statusCode = 500
    response.setHeader("content-type", "text/plain; charset=utf-8")
  }
  response.end("Internal Server Error")
}
