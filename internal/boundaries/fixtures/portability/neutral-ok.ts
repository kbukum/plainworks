// Fixture: a neutral `.` entry that touches only the universal Web globals the portability gate
// allows — the value types bound by `types/universal-web.d.ts` (AbortController, Headers, URL,
// URLSearchParams, TextDecoder, fetch). It must typecheck under the ES2023-only lib with no DOM or
// Node types, proving the gate accepts a genuinely host-independent module.
export function touchUniversals(): boolean {
  const controller = new AbortController()
  const headers = new Headers({ "x-test": "1" })
  const url = new URL("https://example.test/path?a=1")
  const params = new URLSearchParams("a=1")
  const decoder = new TextDecoder()
  void fetch
  return (
    controller.signal.aborted === false &&
    headers.has("x-test") &&
    url.origin.length > 0 &&
    params.has("a") &&
    typeof decoder.decode(new Uint8Array()) === "string"
  )
}
