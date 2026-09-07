# Pass 06 — Docs & supply chain

Docs that match the code, and a release path that stays reproducible and honest. AI-authored changes drift docs from behavior and skip the changeset — this pass closes that.

> **Run in a separate, clean-context agent** with a high-capability model. A plan/spec may be passed in as a scope checklist only; it never excuses a baseline violation.

**Scope note.** *Changes mode:* every doc/example the diff touched (or should have touched) matches the new behavior, and a changeset is present when a package changed. *Project mode:* audit the package READMEs, the architecture/layer docs, and the release wiring for drift.

## Docs checks

- **README per package.** Each package has a README that states its concern in one line, shows the real import surface (`@plainworks/<name>` and, for client packages, `@plainworks/<name>/client`), and a runnable example. A README that documents a removed/renamed export, an import path that doesn't exist, or a signature that changed in the diff is a should-fix.
- **Server/client split is documented.** For a package with a client entry, the README makes clear what is server-safe (`.`) vs client-only (`./client`, `"use client"`). Silent omission that could lead a consumer to import client code on the server is a should-fix.
- **Layer map stays single-source.** The dependency direction lives in the `LAYERS` table in `internal/boundaries/.dependency-cruiser.cjs`; the README and `docs/architecture.md` mirror it. A new package added without its layer row, or a doc layer map that has drifted from the gate, is a should-fix — the gate is truth, the docs must follow it.
- **No history/plan narration in shipped docs.** READMEs and `docs/` describe the code **as it is today**, not "we migrated from X" or "step 4 will add Y". Migration/plan notes belong in `tmp/`. Prose flows naturally (no hard-wrapped columns); diagrams (mermaid) where they clarify architecture.
- **Commands are real.** Every command in docs exists in a `package.json` or `turbo.json` (`bun run <script>`, `turbo run <task> --filter=…`, `bun run gen package`). An invented flag or a stale command is a should-fix — verify against the manifests.

## Readability checks (a crowded doc is a defect, not thoroughness)

- **Simple, organized, uncrowded.** A README or design doc that reads as a jargon-dense wall of text, stacks many identifiers into one sentence, or over-explains the obvious is a should-fix — a reader under time pressure gives up on it. The fix is the shortest organized version that still answers the question, using current documentation best practices.
- **Scannable and task-first.** The page leads with the shortest working path (import + a runnable example) before deep reference; it uses meaningful headings, short lists, and tables, and bolds the load-bearing terms. A page that buries the quickstart under prose, or is one long undifferentiated section, is a should-fix.
- **Dense detail belongs in a table or example, not a sentence.** Option lists, identifier catalogs, and signature detail packed into prose are a should-fix — move them into a table or a real snippet.
- **Diagram where prose is the wrong tool.** Architecture, dependency direction, an auth/reconnect flow, or a state machine gets a focused `mermaid` diagram (one idea per diagram, one-line caption) rather than a paragraph the reader has to simulate in their head. A missing diagram where one would obviously help is a nit→should-fix; a trivial or decorative diagram is noise.

## Supply-chain checks

- **Changeset present.** Any change to a publishable package needs a changeset (`.changeset/*.md`) with the right bump. A behavioral/public change with no changeset is a should-fix. Pre-1.0: breaking changes are `minor`, everything else `patch` — don't hand-edit versions or a CHANGELOG; Changesets owns both.
- **Single catalog.** Versions resolve through the root catalog (`catalog:` / `workspace:*`); Sherif + Syncpack are green (`bun run check-versions`). A second copy of a dependency at a different version, or an inline range, is a should-fix.
- **Lockfile committed & frozen-install clean.** `bun.lock` is committed and consistent; CI installs with `--frozen-lockfile`. A dependency change without a lockfile update (or a lockfile that drifts) is a should-fix.
- **Actions pinned by SHA.** Every `uses:` in `.github/workflows/**` is pinned to a full commit SHA with a `# vX.Y.Z` comment, not a moving tag. A tag-pinned action is a should-fix (supply-chain baseline). Each job declares least-privilege `permissions`.
- **New dependency is justified.** A newly added runtime dep needs a one-line reason, a maintained upstream, a compatible license, and no unfixed advisory. Prefer the platform (`fetch`, `EventSource`, `AbortController`, Web Crypto) and `@plainworks/std` over a new dep. An unjustified or redundant dep is a should-fix.

## Detection starters

```bash
git diff --name-only origin/main... | rg '^packages/' | cut -d/ -f2 | sort -u   # packages touched…
ls .changeset/*.md                                                             # …must have a changeset
rg -n "uses:\s+\S+@[^#]*$" .github/workflows                                    # tag-pinned (unpinned) actions
bun run check-versions                                                          # catalog / dedupe gate
```
