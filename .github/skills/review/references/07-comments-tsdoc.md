# Pass 07 — Comments & TSDoc

Comments that explain *why*, and public API docs that match the signature. AI tends to over-comment the obvious and let doc comments drift from the code — this pass trims and re-aligns.

> **Run in a separate, clean-context agent** with a high-capability model. A plan/spec may be passed in as a scope checklist only; it never excuses a baseline violation.

**Scope note.** *Changes mode:* the comments/TSDoc in the diff are accurate and earn their place. *Project mode:* sweep a package for stale doc comments and comment noise.

## Checks

- **Comments explain why, not what.** A comment restating the code (`// increment i`, `// set the token`) is noise — remove it. Keep comments that capture a non-obvious reason: a protocol/spec constraint, a security invariant, a deliberate trade-off, a workaround with its cause. This is the single most common AI-comment smell.
- **Describe the code as it is.** No narration of the change or the author's process (`// changed to fix bug`, `// new approach`, `// used to be a singleton`). Git history holds that. A "was/now/previously" comment is a should-fix.
- **Visualize state/graph reasoning.** Where a comment explains a state machine, event ordering, or a layout (reconnect backoff, PKCE exchange, cookie precedence), a small easy-to-visualize sketch (an arrow/edge map, a before→after) beats a paragraph. Prefer it when it clarifies.
- **No commented-out code.** Delete it — git history exists. A commented-out block is a should-fix.
- **TSDoc on public API.** Every exported function/type/class in a package's public surface has a TSDoc block: a one-line summary, `@param`/`@returns` where non-obvious, `@throws` for the typed error it can reject with, and `@example` for the primary entry points. A public export with no doc, or a `@param` that names an argument the signature no longer has, is a should-fix.
- **Server/client & security notes where they matter.** A client-only export (`"use client"`, `./client`) says so; a security-sensitive API (token handling, cookie flags, redirect validation) documents the invariant it upholds so a consumer can't misuse it. Missing such a note on an auth/security export is a should-fix.
- **No stray `TODO`/`FIXME`/`HACK`.** Each must link a tracked issue, or it doesn't land. An untracked marker is a should-fix.

## Detection starters

```bash
rg -n "^\s*//\s*(TODO|FIXME|HACK)" packages/*/src                       # must link an issue
rg -n "^\s*//\s*(changed|was |now |previously|used to|refactor)" packages/*/src  # process narration
rg -n "^\s*//\s*(export|const|function|class|return|if)\b" packages/*/src        # commented-out code
rg -n "^export (async )?(function|const|class|interface|type|enum)" packages/*/src  # public items → need TSDoc
```

Read the flagged exports and confirm each has an accurate TSDoc block; a signature/`@param` mismatch is the tell that a doc drifted.
