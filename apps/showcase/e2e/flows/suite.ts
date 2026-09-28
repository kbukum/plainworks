import type { Flow } from "@plainworks/testkit/browser"
import { createTaskFlow } from "./create-task"
import { navigationFlow } from "./navigation"

/** Every showcase flow, in suite order. `flows.spec.ts` and `ui:check` both run this list. */
export const SHOWCASE_FLOWS: readonly Flow[] = [navigationFlow, createTaskFlow]
