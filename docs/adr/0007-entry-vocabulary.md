# 0007 — One entry vocabulary for every package

**Status:** Accepted · **Date:** 2026-09-30

## Context

Packages had grown their own ways to split an import surface: flat roots that mixed concerns, `./dom` entries, and aggregate barrels. A reader couldn't tell from an import path what it pulled in, or whether it would compile on a server, in React Native, or only in a browser.

## Decision

Every package uses the same entry kinds, named by concern and never by host:

| Entry | Holds | Runs on |
|---|---|---|
| `.` | The package's **prelude**: the everyday names every module needs | Any web-standard runtime |
| `./<concern>` | One **module** per concern, named after its folder (`std/time`, `http/list`) | Same as `.` |
| `./client` | React bindings, in the RSC "client component" sense | DOM-free unless the package declares `dom: true` |
| `./<adapter>` | A host implementation of a seam, named for what it does (`state/web-storage`, `auth/form-post`) | Its own lib profile |
| `./server` | Server-only code, such as token custody | Server |
| `./testing` | Test-only helpers | Tests; production code never imports it |

Every name has exactly one import path. Concern code is never re-exported through `.`, and `./client` is never the default import. Browser behavior reaches a DOM-free `./client` only through an injected seam; when it's missing, `./client` fails with a typed error rather than falling back to a DOM global.

## Consequences

- The import path tells you both the concern and where the code can run.
- The portability gate compiles `.` and DOM-free `./client` without DOM or Node types, so a stray host global fails the build.
- A React Native adapter can later sit beside the browser one without touching `./client`.
