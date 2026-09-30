// Re-export-only barrel for the host-neutral Tasks domain: shape guards, validated writes, and page
// reconciliation.
export { dropTaskFromPage, reconcileTaskInPage } from "./page"
export { isTask, TASK_STATUSES } from "./shape"
export { createTask, updateTask } from "./write"
