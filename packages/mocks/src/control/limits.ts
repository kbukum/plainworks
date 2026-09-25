/**
 * The most request-log entries the control plane keeps, shared by the server handlers and
 * {@link createMockControlClient} so the client rejects a log the server could never send.
 */
export const MAX_REQUEST_LOG_SIZE = 1000
