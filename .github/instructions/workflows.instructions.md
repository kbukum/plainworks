---
applyTo: ".github/workflows/**"
---

GitHub Actions CI for plainworks. Follow the full baseline in [`../copilot-instructions.md`](../copilot-instructions.md).

Non-negotiables for any workflow change:

- **Pin every action by full commit SHA**, with the human-readable version in a trailing comment (e.g. `uses: actions/checkout@3d3c42e… # v7.0.1`). Never a floating tag or branch.
- **Least privilege.** `permissions: contents: read` at the top level; a job opts into more only if it needs it, scoped to that job.
- **Concurrency.** One in-flight run per ref with `cancel-in-progress: true`.
- **Node matrix N / N-1 LTS** (`22`, `24`) for the verify job; keep it in step with the `engines` field.
- **bun** is the package manager: `oven-sh/setup-bun` pinned to `1.3.6`, then `bun install --frozen-lockfile`.
- **Run the gates through the root scripts**, in the DoD order, so CI and local stay identical: `check-versions → lint → typecheck → check-boundaries → build → test`.
- **Generator smoke job** must stay: regenerate a server-only and a client package, run every gate on the output, and assert the `"use client"` directive is preserved in `dist/client.js` and absent from `dist/index.js`. It mutates only the ephemeral runner checkout — nothing is committed.
- Release automation (Changesets) is added deliberately; keep it a separate, minimally-permissioned job.

Validate a workflow edit locally with `act` (`nektos/act`) where practical; otherwise reason through the permissions and pinning before pushing.
