---
"@plainworks/channel": minor
---

Make a channel re-connectable. Closing a channel now ends the current session rather than retiring the channel for good, so a later `connect()` opens a fresh session and resumes from the last event id. Each `connect()` owns its own cancellation root, so a close reliably tears down the live stream and its timers.

The React binding is simpler as a result: the provider holds one channel for its lifetime and just connects on mount and closes on unmount. A StrictMode or remount cycle reconnects the same channel instead of rebuilding one and re-attaching every listener, so subscriptions and the resume cursor survive a reconnect on their own.
