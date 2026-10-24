# Tests

Behavior is proven test-first and deterministically. A green run with thin assertions is not a pass; read the tests.

Rules: [Testing and proof](../../../engineering.md#testing-and-proof). Placement: [Testing](../../../../docs/architecture.md#testing).

**Changes:** each behavior change has a test that fails without it. **Project:** coverage floors per package and sweeps for nondeterminism and duplicated fakes.

## Checks

| Finding | Severity |
|---|---|
| Behavior change with no test | blocker |
| Real clock, network, filesystem, or unseeded randomness in a unit test | blocker |
| Lowered coverage threshold, or a test that hits lines but asserts nothing | blocker |
| New remote, stream, or auth path tested only on success (no timeout, abort, reconnect, expiry, or rejection) | should-fix |
| Test that restates the implementation instead of observable behavior | should-fix |
| Order-dependent test or shared module state | should-fix |
| Inline fake that duplicates a `testkit` double | should-fix |
| DOM test in a node project, or the reverse | should-fix |
| Unit proof claimed as integration, clean-install, or real-browser proof | should-fix |

## Detection starters

```bash
rg "setTimeout\(|await new Promise\(res" packages/*/src --glob '*.test.*'
rg "https?://|fetch\(" packages/*/src --glob '*.test.*'
rg "Date\.now\(\)|Math\.random\(\)" packages/*/src --glob '*.test.*'
rg "class Fake|const fake\w+ =" packages/*/src --glob '*.test.*'
bun run verify --filter=@plainworks/<name>
```
