// Fixture: auth's server-only custody graph (stand-in for `server/hmac-signer.ts`). It holds the
// session-signing secret, so no client graph may import it — the `no-client-into-auth-server` rule.
export function signWithSecret(message: string): string {
  return `signed:${message}`
}
