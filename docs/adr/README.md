# Architecture decision records

Each record captures one settled decision: the context that forced a choice, the choice itself, and what it commits us to. Records are immutable once accepted — supersede an old one with a new record rather than rewriting it.

| # | Decision | Status |
|---|---|---|
| [0001](./0001-authorization-lives-in-auth.md) | Authorization ships now as a seam and guards inside `auth` | Accepted |
| [0002](./0002-bff-cookie-default-token-interop.md) | The BFF session cookie is the default token interop; `jwt` serves direct-token backends | Accepted |
| [0003](./0003-thin-persisted-state.md) | Persisted state stays thin cache-routing, not a sync engine | Accepted |
| [0004](./0004-resilience-stays-in-std.md) | Resilience primitives stay in `std` | Accepted |
| [0005](./0005-three-host-breadth.md) | Host breadth is three references, one delivered per plan | Accepted |
