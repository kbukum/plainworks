import { FlowError } from "../errors"
import {
  FLOW_MODES,
  MODE_ONLY_THEME_AXES,
  type PageVariant,
  PREFERENCE_IDS,
  pageVariant,
  type ThemeAxes,
} from "./axes"
import { DEVICE_IDS, DEVICE_PROFILES, type DeviceProfile } from "./devices"
import { samplePairwise } from "./pairwise"
import {
  MATRIX_PRESETS,
  type MatrixPresetName,
  type MatrixSpec,
  type ThemeAxisSelection,
} from "./presets"

/** One device and the page variants a flow captures on it at every checkpoint. */
export interface DevicePlan {
  readonly device: DeviceProfile
  readonly variants: readonly PageVariant[]
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Expand a matrix, or a preset by name, into one plan per device. Variants keep a stable id built
 * from their values, and a device appears once however many variants it carries, so a flow replays
 * once per device. Throws a `flow/definition` {@link FlowError} for an empty axis or a value the
 * engine or the host's `axes` does not define.
 */
export function expandFlowMatrix(
  matrix: MatrixSpec | MatrixPresetName,
  axes: ThemeAxes = MODE_ONLY_THEME_AXES,
): DevicePlan[] {
  const spec = typeof matrix === "string" ? presetOf(matrix) : matrix
  const devices = checked("device", spec.devices, DEVICE_IDS)
  const modes = checked("mode", spec.modes, FLOW_MODES)
  const themes = checked("theme", select(spec.themes, axes.themes, axes.defaultTheme), axes.themes)
  const densities = checked(
    "density",
    select(spec.densities, axes.densities, axes.defaultDensity),
    axes.densities,
  )
  const preferences = checked("preference", spec.preferences, PREFERENCE_IDS)
  for (const value of [...themes, ...densities]) {
    if (!SLUG.test(value)) {
      throw new FlowError("definition", `Theme axis value must be a lowercase slug: "${value}"`)
    }
  }

  const sizes = [devices.length, modes.length, themes.length, densities.length, preferences.length]
  const rows = spec.sampling === "pairwise" ? samplePairwise(sizes) : crossProduct(sizes)
  const variants = new Map(devices.map((device) => [device, new Map<string, PageVariant>()]))
  for (const [device, mode, theme, density, preference] of rows) {
    const variant = pageVariant({
      mode: at(modes, mode),
      theme: at(themes, theme),
      density: at(densities, density),
      preference: at(preferences, preference),
    })
    variants.get(at(devices, device))?.set(variant.id, variant)
  }
  return devices.map((device) => ({
    device: DEVICE_PROFILES[device],
    variants: [...(variants.get(device)?.values() ?? [])],
  }))
}

function presetOf(name: string): MatrixSpec {
  const preset = Object.entries(MATRIX_PRESETS).find(([key]) => key === name)?.[1]
  if (preset === undefined) {
    const known = Object.keys(MATRIX_PRESETS).join(", ")
    throw new FlowError("definition", `Unknown matrix preset "${name}"; use one of ${known}`)
  }
  return preset
}

function select(
  selection: ThemeAxisSelection,
  all: readonly string[],
  fallback: string,
): readonly string[] {
  if (selection === "default") return [fallback]
  if (selection === "all") return all
  return selection
}

function checked<T extends string>(
  axis: string,
  values: readonly string[],
  known: readonly T[],
): T[] {
  const unique = [...new Set(values)]
  if (unique.length === 0) {
    throw new FlowError("definition", `A flow matrix needs at least one ${axis}`)
  }
  return unique.map((value) => {
    const match = known.find((candidate) => candidate === value)
    if (match === undefined) {
      throw new FlowError(
        "definition",
        `Unknown ${axis} "${value}"; use one of ${known.join(", ")}`,
      )
    }
    return match
  })
}

function crossProduct(sizes: readonly number[]): number[][] {
  return sizes.reduce<number[][]>(
    (rows, size) =>
      rows.flatMap((row) => Array.from({ length: size }, (_, value) => [...row, value])),
    [[]],
  )
}

function at<T>(values: readonly T[], index: number | undefined): T {
  const value = values[index ?? -1]
  if (value === undefined) {
    throw new FlowError("definition", `Matrix index ${index} is out of range`)
  }
  return value
}
