import type { Flow } from "@plainworks/testkit/playwright"
import { overlaysFlow } from "./overlays"
import { pagesFlow } from "./pages"
import { signInFlow } from "./sign-in"

/** Every Next host flow, in suite order. `flows.spec.ts` runs this list. */
export const NEXT_HOST_FLOWS: readonly Flow[] = [signInFlow, pagesFlow, overlaysFlow]
