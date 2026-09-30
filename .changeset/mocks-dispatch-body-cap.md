---
"@plainworks/mocks": minor
---

Mock request bodies now have a size limit. `dispatchMockRequest` takes a `maxBodyBytes` option (default 1 MiB) and answers a larger body with a JSON `413` before any handler runs. The Vite plugin streams the body straight into dispatch. A client that disconnects aborts the request, so no handler runs and no response is written.
