// The local mock backend the host serves its domain from — the Next route-handler equivalent of a
// real API origin. It builds a seeded, single-domain (tasks) mock straight from the published
// `@plainworks/mocks` primitives (a generated app owns its domain; the kit ships the primitives,
// not a demo) and dispatches an incoming `Request` through the MSW handlers via `handler.run`, so
// the browser's `/api/*` calls and the RSC prefetch both read one set of seeded fixtures over real
// HTTP. Pure (no `next/*`, no module state) and server-bound: the `server-only` marker keeps the
// seeded backend out of any client bundle. The shared dev-adapter singleton a route handler calls
// lives in `backend.ts`.

import "server-only"

import {
  createCrudHandlers,
  createEntityFactory,
  createLatency,
  createMockControl,
  createReloadableFixtureSources,
  createStore,
  daysAgo,
  daysFromNow,
  type EntityFactory,
  type EntityStore,
  type FixtureSources,
  type InputSpec,
  type LatencyController,
  nowISOString,
  randomBoolean,
  randomElement,
  randomElements,
  randomInt,
} from "@plainworks/mocks"
import { type Clock, systemClock } from "@plainworks/std"
import type { CreateTaskInput, Task } from "../neutral/task"

/** One MSW request handler, as produced by the `@plainworks/mocks` builders. */
type MockHandler = ReturnType<typeof createCrudHandlers>[number]

const TASK_TITLES = [
  "Review pull request",
  "Update documentation",
  "Fix login bug",
  "Implement feature X",
  "Write unit tests",
  "Deploy to staging",
]
const TASK_TAGS = ["frontend", "backend", "bug", "feature", "docs", "urgent"]
const STATUSES: Task["status"][] = ["todo", "in-progress", "done", "blocked"]
const PRIORITIES: Task["priority"][] = ["low", "medium", "high"]

const PRIORITY_RANK: Record<Task["priority"], number> = {
  high: 3,
  medium: 2,
  low: 1,
}

function comparePriority(a: unknown, b: unknown): number {
  const rankA = PRIORITY_RANK[a as Task["priority"]] ?? 0
  const rankB = PRIORITY_RANK[b as Task["priority"]] ?? 0
  return rankA - rankB
}

const TASK_INPUT_SPEC: InputSpec<CreateTaskInput> = {
  title: { kind: "string", required: true },
  description: { kind: "string" },
  status: { kind: "enum", values: ["todo", "in-progress", "done", "blocked"] },
  priority: { kind: "enum", values: ["low", "medium", "high"] },
  assigneeId: { kind: "string" },
  dueDate: { kind: "string" },
  tags: { kind: "stringArray" },
}

/** Build one seeded task from the injected fixture sources — same seed + clock → same fixture. */
function createTaskEntity(sources: FixtureSources, input?: Partial<CreateTaskInput>): Task {
  const { rng, clock, nextId } = sources
  const title = input?.title || randomElement(rng, TASK_TITLES)
  return {
    id: nextId("task"),
    title,
    description: input?.description || `Details for: ${title}`,
    status: input?.status || randomElement(rng, STATUSES),
    priority: input?.priority || randomElement(rng, PRIORITIES),
    assigneeId: input?.assigneeId,
    assigneeName: randomBoolean(rng, 0.7) ? `User ${randomInt(rng, 1, 10)}` : undefined,
    dueDate:
      input?.dueDate ??
      (randomBoolean(rng, 0.6) ? daysFromNow(clock, randomInt(rng, 1, 30)) : undefined),
    tags: input?.tags || randomElements(rng, TASK_TAGS, randomInt(rng, 0, 3)),
    createdAt: daysAgo(clock, randomInt(rng, 0, 60)),
    updatedAt: nowISOString(clock),
  }
}

/** A seeded task factory driven by the per-domain fixture sources. */
function createTaskFactory(sources: FixtureSources): EntityFactory<Task, CreateTaskInput> {
  return createEntityFactory<Task, CreateTaskInput>({
    create: (input) => createTaskEntity(sources, input),
    defaultSeedCount: 40,
  })
}

/** The `/api/tasks` CRUD handlers against this backend's store. */
function createTaskHandlers(
  factory: EntityFactory<Task, CreateTaskInput>,
  store: EntityStore<Task>,
  latency: LatencyController,
  clock: Clock,
): MockHandler[] {
  return createCrudHandlers<Task, CreateTaskInput>({
    basePath: "/api/tasks",
    entityName: "Task",
    store,
    createEntity: factory.create,
    latency,
    clock,
    inputSpec: TASK_INPUT_SPEC,
    searchFields: ["title", "description"],
    sortFields: ["title", "status", "priority", "createdAt"],
    sortComparators: {
      priority: comparePriority,
    },
  })
}

/** Options for {@link createDemoBackend}. */
export interface DemoBackendOptions {
  /** Seed for fixture generation — same seed + clock → identical fixtures. Defaults to a fixed seed. */
  seed?: number
  /** Time source for fixture timestamps. Defaults to the wall clock. */
  clock?: Clock
}

/** The local mock backend: the seeded store plus a bound {@link dispatch}. */
export interface DemoBackend {
  /** Route one `Request` through the mock handlers, always resolving to a `Response`. */
  dispatch(request: Request): Promise<Response>
}

/**
 * Build a fresh, isolated mock backend for the tasks domain. Each call seeds its own store — no
 * shared module state — so two backends never observe each other.
 */
export function createDemoBackend(options: DemoBackendOptions = {}): DemoBackend {
  const seed = options.seed ?? 7
  const clock = options.clock ?? systemClock
  const latency = createLatency(0)
  const sources = createReloadableFixtureSources(seed, "tasks", clock)
  const factory = createTaskFactory(sources)
  factory.getSeeded()
  const store = createStore(() => factory.getSeeded())
  const { loggingHandler, handlers: controlHandlers } = createMockControl(
    latency,
    () => {
      sources.reload()
      factory.resetSeeded()
      factory.getSeeded()
      store.reset()
    },
    clock,
  )
  const handlers: MockHandler[] = [
    loggingHandler,
    ...createTaskHandlers(factory, store, latency, clock),
    ...controlHandlers,
  ]
  return { dispatch: (request) => dispatchMock(request, handlers) }
}

/**
 * Find the first MSW handler that matches `request` and return its `Response`. A request with no
 * matching handler resolves to a JSON `404` — the API namespace is terminal, so an unmatched path
 * is a client error, never a silent pass-through.
 */
export async function dispatchMock(request: Request, handlers: MockHandler[]): Promise<Response> {
  const requestId = crypto.randomUUID()
  for (const handler of handlers) {
    // MSW brands its handler I/O with its own `StrictRequest`/`Response` types. They are
    // structurally the host's global fetch `Request`/`Response`, so cross the nominal seam here.
    const result = await handler.run({
      request: request as Parameters<typeof handler.run>[0]["request"],
      requestId,
    })
    if (result?.response) {
      return result.response as unknown as Response
    }
  }
  return Response.json(
    { error: `No mock handler for ${request.method} ${new URL(request.url).pathname}` },
    { status: 404 },
  )
}
