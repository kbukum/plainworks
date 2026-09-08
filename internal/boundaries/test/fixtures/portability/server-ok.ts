// Fixture: a server-only `./server` entry (token custody) that touches only universal Web value
// globals — here the symmetric `TextEncoder`/`TextDecoder` pair the shim binds, as auth's HMAC
// signer does (`new TextEncoder().encode(message)`). It must typecheck under the ES2023-only lib with
// no DOM or Node types, proving the quarantined server entry is still host-independent: it runs on
// any web-standard runtime (Node, edge, workers), it is merely kept out of the client bundle.
export function encodeAndBack(message: string): boolean {
  const bytes = new TextEncoder().encode(message)
  const decoded = new TextDecoder().decode(bytes)
  return decoded === message
}
