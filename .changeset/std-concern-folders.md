---
"@plainworks/std": patch
---

Organize `std` by concern. The source now lives in concern folders (`error`, `encoding`, `privacy`, `time`, `web`), and state reconciliation sits with the other seams. The public `.` entry exports the same names as before, so imports don't change.
