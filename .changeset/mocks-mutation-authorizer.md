---
"@plainworks/mocks": patch
---

Add an optional `authorize` seam to `createCrudHandlers` (`MutationAuthorizer`) so a host can enforce authorization at the server mutation boundary. When provided, each POST/PATCH/DELETE is checked before the store is touched and a denied request is answered with `403`, keeping a client-side gate a UX affordance rather than the authorization. Read requests are never gated, and omitting the seam leaves writes open as before.
