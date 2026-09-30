# 0010 — Test machinery and runtime capabilities have separate owners

**Status:** Accepted · **Date:** 2026-09-30

## Context

`testkit` had started to hold code that apps also wanted at runtime (clipboard, media queries, focus helpers), and apps took runtime dependencies on it to get them. Mock services had two homes: `testkit` wrapped parts of `mocks`, and the mock IdP was copied into tests.

## Decision

Split by where the code runs.

| Kind of code | Owner |
|---|---|
| Fakes, clocks, runner hooks, render and axe helpers, anything that drives a Playwright page | `testkit` |
| Mocked services: MSW handlers and lifecycle, request dispatch, the mock IdP, demo streams | `mocks` |
| Capabilities an app uses at runtime | A runtime package: neutral logic in `std`, browser hooks in `ui` |

`testkit` uses runtime capabilities and never copies them. `mocks` takes runner hooks as parameters, so it never imports a test runner. An app keeps `testkit` as a dev dependency only; a starter keeps `mocks` in `dependencies` because its sample backend runs on it, and replacing that backend with a real API is its documented first step.

## Consequences

- Apps get runtime helpers without shipping test tooling.
- Each mocked service has one implementation, shared by unit tests, integration tests, and demo apps.
- A new runtime capability lands in a concern-named home only when a consumer needs it.
