import type { Flow } from "./definition"
import { FlowError } from "./errors"
import type { ThemeAxes } from "./matrix/axes"
import { DEFAULT_MATRIX_PRESET, MATRIX_PRESETS, type MatrixPresetName } from "./matrix/presets"
import { type PlannedFlowRun, planFlowRuns } from "./plan"
import type { FlowRunMode } from "./report/schema"

/**
 * The environment a caller such as `ui:check` sets to pick a suite's flows (comma-separated
 * names), preset, and mode. A plain `playwright test` sets none, and runs every flow in `assert`
 * mode at the default preset.
 */
export const FLOW_SUITE_ENV: {
  readonly flows: "PLAINWORKS_FLOWS"
  readonly preset: "PLAINWORKS_FLOW_PRESET"
  readonly mode: "PLAINWORKS_FLOW_MODE"
} = {
  flows: "PLAINWORKS_FLOWS",
  preset: "PLAINWORKS_FLOW_PRESET",
  mode: "PLAINWORKS_FLOW_MODE",
}

/** Options for {@link planFlowSuite}. */
export interface FlowSuiteOptions {
  /** The host's theme vocabulary. Defaults to light and dark only. */
  readonly axes?: ThemeAxes
  /** Where the selection is read from. Defaults to `process.env`. */
  readonly env?: Readonly<Record<string, string | undefined>>
}

/** A planned suite: its mode, its preset, and one run per selected flow and device. */
export interface FlowSuite {
  readonly mode: FlowRunMode
  readonly preset: MatrixPresetName
  readonly runs: readonly PlannedFlowRun[]
}

/**
 * Plan a flow spec's suite from the environment: the named flows (or all), the named preset (or
 * `quick`), and the mode (or `assert`). One spec then serves CI, which asserts, and `ui:check`,
 * which captures. Throws a `flow/definition` {@link FlowError} for an unknown flow, preset, or
 * mode.
 */
export function planFlowSuite(flows: readonly Flow[], options: FlowSuiteOptions = {}): FlowSuite {
  const env = options.env ?? process.env
  const preset = presetOf(env[FLOW_SUITE_ENV.preset])
  const mode = modeOf(env[FLOW_SUITE_ENV.mode])
  const selected = selectFlows(flows, env[FLOW_SUITE_ENV.flows])
  const runs = planFlowRuns(selected, {
    matrix: preset,
    ...(options.axes === undefined ? {} : { axes: options.axes }),
  })
  return { mode, preset, runs }
}

const isPreset = (value: string): value is MatrixPresetName => Object.hasOwn(MATRIX_PRESETS, value)

function presetOf(value: string | undefined): MatrixPresetName {
  if (value === undefined || value === "") return DEFAULT_MATRIX_PRESET
  if (isPreset(value)) return value
  const known = Object.keys(MATRIX_PRESETS).join(", ")
  throw new FlowError("definition", `Unknown matrix preset "${value}"; use one of ${known}`)
}

function modeOf(value: string | undefined): FlowRunMode {
  if (value === undefined || value === "") return "assert"
  if (value === "assert" || value === "capture") return value
  throw new FlowError("definition", `Unknown flow mode "${value}"; use assert or capture`)
}

function selectFlows(flows: readonly Flow[], names: string | undefined): readonly Flow[] {
  if (names === undefined || names.trim() === "") return flows
  return names
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "")
    .map((name) => {
      const flow = flows.find((candidate) => candidate.name === name)
      if (flow === undefined) throw new FlowError("definition", `Unknown flow "${name}"`)
      return flow
    })
}
