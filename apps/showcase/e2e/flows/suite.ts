import type { Flow } from "@plainworks/testkit/playwright"
import { createTaskFlow } from "./create-task"
import { dialogsFlow } from "./dialogs"
import { galleryFlow, galleryModalsFlow, galleryPopupsFlow } from "./gallery"
import { navigationFlow } from "./navigation"
import { overlaysFlow } from "./overlays"
import { pagesFlow } from "./pages"
import { signInFlow } from "./sign-in"
import { contentFlow, emptyFlow, failureFlow, loadingFlow, serverPaintFlow } from "./states"
import { typedFailuresFlow } from "./typed-failures"

/** Every showcase flow, in suite order. `flows.spec.ts` and `ui:capture` both run this list. */
export const SHOWCASE_FLOWS: readonly Flow[] = [
  navigationFlow,
  createTaskFlow,
  signInFlow,
  pagesFlow,
  loadingFlow,
  failureFlow,
  emptyFlow,
  contentFlow,
  serverPaintFlow,
  overlaysFlow,
  dialogsFlow,
  galleryFlow,
  galleryPopupsFlow,
  galleryModalsFlow,
  typedFailuresFlow,
]
