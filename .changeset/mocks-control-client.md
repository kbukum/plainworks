---
"@plainworks/mocks": patch
---

Add `createMockControlClient`, a typed client for the `/mock/*` control plane that validates every response, so tools and panels stop re-implementing the wire contract. `MOCK_CONTROL_PATHS` names the routes.
