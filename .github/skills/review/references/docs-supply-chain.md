# Docs and supply chain

Docs that match the code and a release path that stays reproducible.

Rules: [Documentation and consumer experience](../../../engineering.md#documentation-and-consumer-experience), [Dependencies and supply chain](../../../engineering.md#dependencies-and-supply-chain). Use the [docs skill](../../docs/SKILL.md) to fix doc findings.

**Changes:** every doc, example, and manifest the diff touched or should have touched. **Project:** package READMEs, `docs/`, workflows, and release wiring.

## Docs

| Finding | Severity |
|---|---|
| Doc shows a removed export, a wrong import path, a changed signature, or an invented command | should-fix |
| Package README that hides which entry is neutral and which is client-only | should-fix |
| History, plan, or migration narration in shipped docs | should-fix |
| Crowded page: wall of identifiers, buried quickstart, dense detail in prose instead of a table or example | should-fix |
| Hand-edited `layer-map` block, or a hard-wrapped Markdown paragraph | should-fix |
| Missing diagram where a flow or state machine is explained in prose | nit |

## Supply chain

| Finding | Severity |
|---|---|
| Atom or lock change without a matching registry run, or a CLI bump leaving old-version atoms | blocker |
| Action pinned by tag instead of a full SHA, or a job without least-privilege `permissions` | should-fix |
| Publishable package change without a Changeset; hand-edited version or changelog | should-fix |
| Inline version range instead of `catalog:` or `workspace:*`; a duplicated dependency | should-fix |
| Dependency change without a matching `bun.lock` update | should-fix |
| New dependency without a reason, a maintained upstream, a compatible license, and no open advisory, or one the platform or `std` already covers | should-fix |

## Detection starters

```bash
git diff --name-only origin/main... | rg '^packages/' | cut -d/ -f2 | sort -u
ls .changeset
rg -n "uses:\s+\S+@[^#]*$" .github/workflows
bun run check-versions
bun run check-registry
bun run check-layer-map
```
