# Browser gate

The browser gate runs both reference hosts, the [showcase](../apps/showcase/README.md) and the [Next host](../apps/next-host/README.md), in real Chromium. Every test starts from seeded data and a fixed clock, and fails on any runtime error, hydration error, or request that leaves the host. The shared gate lives in [`@plainworks/testkit/browser`](../packages/testkit/README.md#browser-gate--plainworkstestkitbrowser).

## Run it

```bash
bunx turbo run build --filter=@plainworks/showcase^...   # the host's workspace dependencies
bunx playwright install chromium
bun run --filter @plainworks/showcase e2e                 # every test
bun run --filter @plainworks/showcase e2e -- --grep-invert @visual   # functional tests only
```

Swap in `@plainworks/next-host` for the Next host. A failed test keeps its trace, and a failed screenshot keeps its actual image and diff, under the app's `test-results/`.

While you iterate, run only what you touched — a spec file or a `--grep` on a surface name — and save the full run for the end:

```bash
bun run --filter @plainworks/showcase e2e -- e2e/visual/gallery.spec.ts
bun run --filter @plainworks/showcase e2e -- --grep "tasks-error"
```

## How it runs in parallel

Each Playwright worker starts **its own host** on its own port and **signs in once**. Tests reset only their own worker's backend, so workers never step on each other.

| | Showcase | Next host |
|---|---|---|
| Workers (local / CI) | half the cores / 2 | a quarter of the cores / 1 |
| Ports | `5199 + n` | `5299 + n` |
| Per-worker isolation | its own Vite dependency cache | its own `.next/e2e-<port>` output |
| Warm-up at start | Vite pre-transforms both graphs | one request per route |

Set `E2E_BASE_PORT` to move the port range, and pass `--workers` to change the worker count. A worker refuses a port another server already answers on, so stop a stale dev server first. Both hosts stay dev servers, because the development inspector is part of what the gate proves.

## What each test checks

| Check | Rule |
|---|---|
| **Runtime errors** | Any page error, `console.error`, failed request, hydration warning, or off-origin request fails the test. A test that provokes one on purpose allows that exact message. |
| **Axe** | No WCAG 2.2 AA violation on the whole page. |
| **Reflow** | No horizontal scrolling, including at 320 CSS px (WCAG 1.4.10). |
| **Overlay containment** | An open dialog, drawer, or menu stays inside the viewport, so none of it is cut off on a short screen. |
| **Focus** | Every keyboard stop checked shows at least a 2 px indicator and is not covered. |
| **Screenshot** | At most 100 pixels may differ, each within a 0.2 color threshold. That is less than one 24×24 control, so a missing or moved control always fails. Animations and the caret are frozen. |

Visual tests carry the `@visual` tag. Each captures one surface, such as a page, an overlay, or a loading, error, or empty state, in light and dark at the viewports its matrix declares.

| Matrix | Viewports | Use it for |
|---|---|---|
| `FULL_MATRIX` | desktop 1440, tablet 768, mobile 390, reflow 320 | pages and gallery groups |
| `COMPACT_MATRIX` | desktop, mobile | menus, popovers, states, inspector panels |
| `DIALOG_MATRIX` | desktop, mobile, landscape 844×390 | dialogs and drawers, which are most likely to overflow a short screen |

## Keep it deterministic

- **Data and time.** Each test resets its worker's mock backend. The host reads `PLAINWORKS_FIXED_NOW` to pin its clock, and the page's `Date` reads the same instant.
- **Environment.** The locale is `en-US`, the time zone is UTC, and motion is reduced.
- **Live updates.** A test pauses a live feed before its first update. When a real timer still drives the page (the Next host's demo stream feeds the devtools rail and inspector), the surface sets `holdsClock`: `arrange` pauses the page clock, the capture runs still, and the clock resumes for the axe scan that follows.
- **No retries.** A flaky result is a defect to fix, not to retry.

## Update baselines

Baselines live next to each spec in `<spec>-snapshots/<platform>/`. Normal runs never write them (`updateSnapshots: "none"`).

- **Linux baselines are committed.** CI compares them, and `e2e:update:linux` is the only way to change them.
- **macOS baselines are local.** Git ignores them. Run `e2e:update` once to create your own set, then again after an intended visual change.

```bash
bun run --filter @plainworks/showcase e2e:update:linux   # committed Linux baselines, in the CI image
bun run --filter @plainworks/showcase e2e:update         # your local macOS (darwin) baselines
```

`e2e:update:linux` runs in the same Playwright image CI uses, pinned by digest, and emulates `linux/amd64` so the pixels match CI. It writes changed or missing baselines, then reruns the suite to prove they are stable. Emulation is slow, so pass a spec file or `--grep` to update only what you touched. A new baseline fails its first run by design, so rerun `e2e` after `e2e:update`.

If Docker reports `cannot overwrite digest`, it has the image's `arm64` variant cached under the same digest. Remove that image (`docker rmi`) and rerun.

To prune baselines for a removed surface, delete that platform folder and regenerate it.

## Review a baseline change

- **Treat a changed image like a code change.** The author explains the visible change in the pull request, and the reviewer opens the diff.
- **Never loosen a threshold or mask to make a test pass.** Masks cover only regions that change for a reason outside the kit.
- **Fix the cause, not the capture.** An unexpected diff, axe violation, or runtime error means the UI changed.

## Add a surface

1. Put an `arrange` function in the spec that brings the page into the state and waits until it settles.
2. Add a surface with a unique slug and the smallest matrix that covers it (`FULL_MATRIX` for pages, `COMPACT_MATRIX` for menus and popovers, `DIALOG_MATRIX` for dialogs and drawers).
   - A tall page uses a `full-page` capture. Chromium would paint `position: fixed` chrome, such as the devtools bar, in the middle of that image, so the capture must name that chrome in `hideFixed`. The capture also starts from the top of the page, so sticky headers stay in place. A `-viewport` twin shows it where a user sees it.
3. Run `e2e:update` and `e2e:update:linux`, then check the new images.
