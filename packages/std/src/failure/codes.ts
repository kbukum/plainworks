/** Canonical application identities. Transport status and retry permission remain separate. */
export const failureCodes = {
  SERVICE_UNAVAILABLE: { rpc: 14, http: 503, retryable: true },
  CONNECTION_FAILED: { rpc: 14, http: 502, retryable: true },
  TIMEOUT: { rpc: 4, http: 504, retryable: true },
  RATE_LIMITED: { rpc: 8, http: 429, retryable: true },
  NOT_FOUND: { rpc: 5, http: 404, retryable: false },
  ALREADY_EXISTS: { rpc: 6, http: 409, retryable: false },
  CONFLICT: { rpc: 9, http: 409, retryable: false },
  INVALID_INPUT: { rpc: 3, http: 422, retryable: false },
  MISSING_FIELD: { rpc: 3, http: 422, retryable: false },
  INVALID_FORMAT: { rpc: 3, http: 422, retryable: false },
  UNAUTHORIZED: { rpc: 16, http: 401, retryable: false },
  TOKEN_EXPIRED: { rpc: 16, http: 401, retryable: false },
  INVALID_TOKEN: { rpc: 16, http: 401, retryable: false },
  FORBIDDEN: { rpc: 7, http: 403, retryable: false },
  INTERNAL_ERROR: { rpc: 13, http: 500, retryable: false },
  DATABASE_ERROR: { rpc: 13, http: 500, retryable: false },
  EXTERNAL_SERVICE_ERROR: { rpc: 13, http: 500, retryable: false },
  CANCELED: { rpc: 1, http: 408, retryable: false },
} as const

export type FailureCode = keyof typeof failureCodes

export function isFailureCode(value: unknown): value is FailureCode {
  return typeof value === "string" && Object.hasOwn(failureCodes, value)
}

/** First canonical identity for a protocol status; rich details may refine it. */
export function failureCodeFor(status: number, transport: "rpc" | "http"): FailureCode {
  for (const code of Object.keys(failureCodes)) {
    if (isFailureCode(code) && failureCodes[code][transport] === status) return code
  }
  return "INTERNAL_ERROR"
}
