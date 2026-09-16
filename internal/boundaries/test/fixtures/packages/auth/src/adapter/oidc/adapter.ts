// Fixture: auth's OIDC adapter module holding the OAuth stack and in-memory tokens.
// No client graph or neutral module may import it.
export function createOidcAdapter(): string {
  return "oidc-adapter"
}
