import { defineFlow, type Flow } from "./definition"
import { FlowError } from "./errors"
import { MODE_ONLY_THEME_AXES, type ThemeAxes } from "./matrix/axes"
import { type DeviceContextOptions, deviceContextOptions } from "./matrix/devices"
import { type DevicePlan, expandFlowMatrix } from "./matrix/expand"
import type { MatrixPresetName, MatrixSpec } from "./matrix/presets"

/** One Playwright test: a flow replayed on one device. */
export interface PlannedFlowRun {
  /** `flow › device`, the test's title. */
  readonly title: string
  readonly flow: Flow
  readonly plan: DevicePlan
  /** The theme vocabulary the variants were planned with, so the run applies the same one. */
  readonly axes: ThemeAxes
  /** The device's context options, for `test.use`. */
  readonly use: DeviceContextOptions
}

/** Options for {@link planFlowRuns}. */
export interface FlowPlanOptions {
  readonly matrix: MatrixSpec | MatrixPresetName
  /** The host's theme vocabulary. Defaults to light and dark only. */
  readonly axes?: ThemeAxes
}

/**
 * Plan a suite: one run per flow and device, so each flow replays once per device and visits
 * every page variant in place. Declare one `test.describe` per run with `test.use(run.use)`, and
 * the runner opens each device's context. Every flow is validated with {@link defineFlow}, so one
 * built by hand is held to the same rules. Throws a `flow/definition` {@link FlowError} for an
 * invalid flow, or for two flows with one name, whose artifacts would collide.
 */
export function planFlowRuns(flows: readonly Flow[], options: FlowPlanOptions): PlannedFlowRun[] {
  const names = new Set<string>()
  for (const flow of flows) {
    defineFlow(flow)
    if (names.has(flow.name)) {
      throw new FlowError("definition", `Two flows are named "${flow.name}"`)
    }
    names.add(flow.name)
  }
  const axes = options.axes ?? MODE_ONLY_THEME_AXES
  const plans = expandFlowMatrix(options.matrix, axes)
  return flows.flatMap((flow) =>
    plans.map((plan) => ({
      title: `${flow.name} › ${plan.device.id}`,
      flow,
      plan,
      axes,
      use: deviceContextOptions(plan.device),
    })),
  )
}
