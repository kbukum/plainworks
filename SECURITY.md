# Security Policy

## Report a vulnerability

Report vulnerabilities **privately** through [GitHub Security Advisories](https://github.com/kbukum/plainworks/security/advisories/new). Do not open a public issue.

Include:

- The issue and its potential impact.
- Reproduction steps and a minimal proof of concept when possible.
- Affected packages and versions.
- Your Node, Bun, and TypeScript versions.
- The runtime where the issue occurs.
- A suggested mitigation when you have one.

## Response targets

| Step | Target |
|---|---|
| Acknowledgment | 48 hours |
| Triage and severity | 5 business days |
| Fix available | 30 days for critical issues; 90 days for high or medium issues |
| Public disclosure | 90 days after the report, coordinated with the reporter |

A confirmed vulnerability in a released version receives a CVE through GitHub Security Advisories. The advisory and release notes credit the reporter unless they prefer anonymity.

plainworks follows [coordinated vulnerability disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure).

## Supported versions

plainworks is pre-1.0. Only the latest published `0.x` line receives security fixes.

| Version | Supported |
|---|---|
| Latest `0.x` | ✅ |
| Older `0.x` | ❌ |

## Use plainworks securely

- **Authentication:** Use Authorization Code with PKCE `S256`. Never use the implicit flow.
- **Token storage:** Keep SPA access tokens in memory or use a BFF with `__Host-` cookies set to `Secure`, `HttpOnly`, and `SameSite=Strict`. Never use `localStorage`, `sessionStorage`, or URL parameters.
- **Transport:** Use TLS for HTTP and streaming transports. Never disable certificate verification in production.
- **Secrets:** Use environment variables or a secret manager. Never commit secrets or embed a client secret in a browser bundle.
- **Untrusted input:** Validate network responses, redirect targets, messages, and other values at each trust boundary.
- **Dependencies:** Review advisories for new dependencies and run `bun run check-versions`.
- **Public types:** Keep public APIs free from `any` and expose typed errors so callers can handle failures safely.

## Supply-chain controls

| Control | Repository behavior |
|---|---|
| GitHub Actions | Every `uses:` reference is pinned to a full commit SHA. |
| Dependency updates | Dependabot updates Actions. The Bun catalog centralizes runtime and tooling versions. |
| Reproducible installs | CI runs `bun install --frozen-lockfile` against the committed `bun.lock`. |
| Versioning | Changesets controls package versions and release notes. |
| Publishing | The release workflow packs with Bun, publishes with npm trusted publishing, and emits provenance. |

Publishing runs only from `main` through the protected `release` environment. The workflow reruns every Definition-of-Done gate before it publishes.
