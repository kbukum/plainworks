import type { DescMessage } from "@bufbuild/protobuf"
import { Code, ConnectError } from "@connectrpc/connect"
import type { FakeUnaryHandler } from "./fake-transport"

/**
 * A unary responder that always fails with a typed `ConnectError` of `code` — the ergonomic way to
 * exercise error mapping and retry classification without hand-writing a throwing closure. Re-exports
 * Connect's `Code` so a test names failures as `failUnary(Code.Unavailable)`.
 *
 * For a *slow* response (timeout/backoff), write the responder inline and await an injected delay,
 * e.g. `fake.unary(m, async (req) => { await delay(1000); return { ... } })` — the responder is an
 * arbitrary async function, so the delay seam is injected there rather than through a bespoke helper.
 */
export function failUnary<I extends DescMessage = DescMessage, O extends DescMessage = DescMessage>(
  code: Code,
  message = "",
): FakeUnaryHandler<I, O> {
  return () => {
    throw new ConnectError(message, code)
  }
}

export { Code }
