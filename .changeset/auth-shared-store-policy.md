---
"@plainworks/auth": minor
---

Add `ServerSession.snapshot(jar)` so hosts read the current session without mapping auth errors themselves. Export the session-store policy (`admitSession`, `admitLogin`, `sessionStoreCapacity` and the lifetime constants) and the refresh-store policy (`refreshStoreLimits`, `decideRefreshRotation`), so custom stores apply the same rotation, lifetime and capacity rules as the memory stores.
