import { setupFlowRun } from "@plainworks/testkit/playwright"

export default (): Promise<() => Promise<void>> => setupFlowRun({ root: ".ui-artifacts/proof" })
