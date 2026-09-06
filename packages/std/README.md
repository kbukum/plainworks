# @plainworks/std

> Zero-dependency, host-independent standard-library primitives and shared contracts for plainworks.

Part of the [plainworks](../../README.md) kit. `std` is the bottom of the layer graph (L0): every other package depends on it, and it depends on nothing. Zero runtime dependencies, no React or DOM — it runs anywhere (Node, edge, RSC, browser).

## Install

```sh
bun add @plainworks/std
```

## What's inside

- **Errors** — `PlainError` (typed base that preserves `cause` and carries a `kind` discriminant), `ensureError`, `getErrorMessage`.
- **Result** — `Result<T, E>` with `ok` / `err` / `isOk` / `isErr` / `unwrap` / `unwrapOr`.
- **Guards** — `isDefined`, `isRecord`, `isNonEmptyString`, `hasProperty`.
- **Assertions** — `assert`, `assertNever`.
- **Utilities** — `randomId` (Web Crypto UUID), `systemClock` + the `Clock` seam.
- **Shared seams** — the single source of truth higher layers implement:
  - `AuthHeaderProvider` / `AuthHeaders` — the header-only auth seam.
  - `PlainEvent` / `Listener` / `Subscription` — the event and teardown shapes.

## Usage

```ts
import { type Result, err, ok, PlainError } from "@plainworks/std"

function parsePort(raw: string): Result<number> {
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return err(new PlainError("config/port", `not a valid port: ${raw}`))
  }
  return ok(port)
}
```
