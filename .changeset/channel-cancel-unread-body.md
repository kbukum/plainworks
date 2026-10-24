---
"@plainworks/channel": patch
---

The SSE transport cancels the unread body of a response with the wrong content type, so the connection is released. The protocol error stays the failure; a failed cancel becomes its cause.
