/** The RFC 9457 members of a problem plus any extension members. */
export interface ProblemInit {
  readonly type?: string
  readonly title?: string
  readonly detail?: string
  readonly instance?: string
  /** Extension members; they never replace a standard member. */
  readonly extensions?: Readonly<Record<string, unknown>>
}

/**
 * An RFC 9457 problem details object for `status`. `type` defaults to `about:blank`.
 *
 * @throws {RangeError} When `status` is not a 4xx or 5xx status.
 */
export function problemJson(status: number, init: ProblemInit = {}): Record<string, unknown> {
  if (!Number.isInteger(status) || status < 400 || status > 599) {
    throw new RangeError(`problemJson: ${status} is not an error status`)
  }
  const { type = "about:blank", title, detail, instance, extensions = {} } = init
  return {
    ...extensions,
    type,
    ...(title === undefined ? {} : { title }),
    status,
    ...(detail === undefined ? {} : { detail }),
    ...(instance === undefined ? {} : { instance }),
  }
}

/** An SSE `failure` frame whose data is the problem for `status`. */
export function problemFrame(status: number, init: ProblemInit = {}): string {
  return `event: failure\ndata: ${JSON.stringify(problemJson(status, init))}\n\n`
}
