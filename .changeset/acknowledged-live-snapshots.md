---
"@plainworks/std": minor
"@plainworks/http": patch
"@plainworks/channel": minor
"@plainworks/query": minor
"@plainworks/mocks": minor
---

Align list responses with generated pagination shapes and absent cursors. Add schema-decoded events, acknowledged resume, shared typed failures, and bounded live snapshot recovery for Query and remote state. Reconnects, resets, and local overflow invalidate raced snapshots instead of silently losing updates. Terminal channel failures remain visible across snapshot-owner replacement.

**Breaking:** Cursor fields are optional strings instead of nullable strings. Omit missing cursors and check for `undefined`, not `null`.
