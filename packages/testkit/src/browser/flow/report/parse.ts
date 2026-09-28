import { CHECK_IDS, type CheckId } from "../../checks/findings"
import { FLOW_ERROR_KINDS, FlowError } from "../errors"
import { FLOW_MODES, PREFERENCE_IDS } from "../matrix/axes"
import { DEVICE_IDS } from "../matrix/devices"
import type {
  CheckpointReport,
  EvidenceLinks,
  FlowDeviceReport,
  FlowStatus,
  ReportedError,
  VariantReport,
} from "./schema"

const STATUSES: readonly FlowStatus[] = ["pass", "fail", "error", "skipped"]

/**
 * Validate one stored run entry (a flow on a device) read back from disk. Throws a `flow/report`
 * {@link FlowError} for anything this schema did not write, so a merged report never carries a
 * malformed entry.
 */
export function parseFlowDeviceReport(value: unknown): FlowDeviceReport {
  if (!isFlowDeviceReport(value)) {
    throw new FlowError("report", "A stored flow run entry does not match the report schema")
  }
  return value
}

type Fields = { readonly [key: string]: unknown }

const isRecord = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === "string"
const oneOf =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): value is T =>
    values.some((candidate) => candidate === value)
const optional =
  <T>(guard: (value: unknown) => value is T) =>
  (value: unknown): value is T | undefined =>
    value === undefined || guard(value)
const listOf =
  <T>(guard: (value: unknown) => value is T) =>
  (value: unknown): value is readonly T[] =>
    Array.isArray(value) && value.every(guard)

const isCheckId = oneOf<CheckId>(CHECK_IDS)
const isStatus = oneOf(STATUSES)

const isFinding = (value: unknown): boolean =>
  isRecord(value) && isCheckId(value.check) && isString(value.message)
const isAllowed = (value: unknown): boolean =>
  isFinding(value) && isRecord(value) && isString(value.reason)
const isError = (value: unknown): value is ReportedError =>
  isRecord(value) && oneOf(FLOW_ERROR_KINDS)(value.kind) && isString(value.message)
const isEvidence = (value: unknown): value is EvidenceLinks =>
  isRecord(value) &&
  isString(value.dom) &&
  isString(value.aria) &&
  isString(value.console) &&
  isString(value.network) &&
  optional(isString)(value.frame)
const findingLists = (value: Fields): boolean =>
  Array.isArray(value.findings) &&
  value.findings.every(isFinding) &&
  Array.isArray(value.allowed) &&
  value.allowed.every(isAllowed)

const isVariant = (value: unknown): value is VariantReport =>
  isRecord(value) &&
  isString(value.id) &&
  oneOf(FLOW_MODES)(value.mode) &&
  isString(value.theme) &&
  isString(value.density) &&
  oneOf(PREFERENCE_IDS)(value.preference) &&
  isStatus(value.status) &&
  findingLists(value) &&
  optional(isString)(value.frame) &&
  optional(isString)(value.aria) &&
  optional(isEvidence)(value.evidence)

const isCheckpoint = (value: unknown): value is CheckpointReport =>
  isRecord(value) &&
  Number.isInteger(value.index) &&
  isString(value.name) &&
  isStatus(value.status) &&
  findingLists(value) &&
  optional(isError)(value.error) &&
  optional(isEvidence)(value.evidence) &&
  listOf(isVariant)(value.variants)

function isFlowDeviceReport(value: unknown): value is FlowDeviceReport {
  return (
    isRecord(value) &&
    isString(value.flow) &&
    oneOf(DEVICE_IDS)(value.device) &&
    oneOf(["assert", "capture"])(value.mode) &&
    isStatus(value.status) &&
    optional(isError)(value.error) &&
    optional(isString)(value.trace) &&
    listOf(isCheckpoint)(value.checkpoints)
  )
}
