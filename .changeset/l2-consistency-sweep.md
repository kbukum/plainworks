---
"@plainworks/state": patch
"@plainworks/auth": patch
"@plainworks/connect": patch
"@plainworks/http": patch
"@plainworks/channel": patch
"@plainworks/std": patch
"@plainworks/ui": patch
"@plainworks/mocks": patch
"@plainworks/testkit": patch
---

Consistency sweep across the kit: naming and placement only, no behavior change.

One word per concept. **Transport** is the injected wire seam (`channel`, `connect`), **adapter** is a registry-selected backend (`auth`), and **seam** is the contract a consumer implements — so the interface modules are now `adapter/seam`, `scope/seam`, and `std`'s `seam/` barrel rather than a mix of `contract` and `seam`. `state`'s `useSyncExternalStore` binding drops the overloaded `adapter` word for React's own vocabulary: `StateAdapter` is now `ExternalStore` and `toAdapter` is `toExternalStore`.

Module paths read by their concern. No file repeats its folder name any more — the scope, auth-adapter, and Connect-RPC modules are `scope/seam`, `adapter/seam`, and `transport/rpc`; `channel`'s `sse`/`ws` transports live under `transport/`, with the single-module `sse` collapsed to one file; `http`'s `method` folder splits the method vocabulary from its idempotency helpers; and `ui`'s layout primitives split into `stack`, `grid`, and `split`. Every multi-module concern folder now has a re-export-only barrel, so a package entry imports the concern rather than reaching into its internals.

`ExternalStore`/`toExternalStore` are the only renamed public exports; every other export keeps its name.
