/**
 * Task data factory
 */

import type { CreateTaskInput, Task } from "../types"
import { daysAgo, daysFromNow, nowISOString } from "../utils"
import { randomBoolean, randomElement, randomElements, randomInt } from "../utils/random"
import { createEntityFactory, type EntityFactory, type FixtureSources } from "./common"

const TASK_TITLES = [
  "Review pull request",
  "Update documentation",
  "Fix login bug",
  "Implement feature X",
  "Write unit tests",
  "Deploy to staging",
  "Code review",
  "Database migration",
  "API integration",
  "Performance optimization",
  "Security audit",
  "UI polish",
]
const TASK_TAGS = ["frontend", "backend", "bug", "feature", "docs", "urgent", "blocked"]
const STATUSES: Task["status"][] = ["todo", "in-progress", "done", "blocked"]
const PRIORITIES: Task["priority"][] = ["low", "medium", "high"]

function createTaskEntity(sources: FixtureSources, input?: Partial<CreateTaskInput>): Task {
  const { rng, clock, nextId } = sources
  const title = input?.title || randomElement(rng, TASK_TITLES)

  return {
    id: nextId("task"),
    title,
    description: input?.description || `Details for: ${title}`,
    status: input?.status || randomElement(rng, STATUSES),
    priority: input?.priority || randomElement(rng, PRIORITIES),
    assigneeId: input?.assigneeId || (randomBoolean(rng, 0.7) ? nextId("user") : undefined),
    assigneeName: randomBoolean(rng, 0.7) ? `User ${randomInt(rng, 1, 10)}` : undefined,
    dueDate:
      input?.dueDate ||
      (randomBoolean(rng, 0.6) ? daysFromNow(clock, randomInt(rng, 1, 30)) : undefined),
    tags: input?.tags || randomElements(rng, TASK_TAGS, randomInt(rng, 0, 3)),
    createdAt: daysAgo(clock, randomInt(rng, 0, 60)),
    updatedAt: nowISOString(clock),
  }
}

/** Build a task factory driven by the injected per-domain FixtureSources (seeded → reproducible). */
export function createTaskFactory(sources: FixtureSources): EntityFactory<Task, CreateTaskInput> {
  return createEntityFactory<Task, CreateTaskInput>({
    create: (input) => createTaskEntity(sources, input),
    defaultSeedCount: 50,
  })
}
