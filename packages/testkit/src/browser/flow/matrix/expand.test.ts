import { describe, expect, it } from "vitest"
import { FlowError } from "../errors"
import type { ThemeAxes } from "./axes"
import { DEVICE_PROFILES } from "./devices"
import { expandFlowMatrix } from "./expand"
import { MATRIX_PRESETS } from "./presets"

const THEME_AXES: ThemeAxes = {
  themes: ["neutral", "indigo", "violet", "blue", "emerald", "orange", "slate", "rose", "cyan"],
  densities: ["comfortable", "compact"],
  defaultTheme: "indigo",
  defaultDensity: "comfortable",
  root: ({ mode, theme, density }) => ({
    className: `${mode} theme-${theme}`,
    attributes: { "data-density": density },
  }),
}

const ids = (plans: ReturnType<typeof expandFlowMatrix>) =>
  plans.map((plan) => [plan.device.id, plan.variants.map((variant) => variant.id)])

describe("expandFlowMatrix", () => {
  it("runs quick by default: desktop and mobile, light and dark, in the default theme", () => {
    expect(ids(expandFlowMatrix("quick", THEME_AXES))).toEqual([
      ["desktop", ["light.indigo.comfortable.standard", "dark.indigo.comfortable.standard"]],
      ["mobile", ["light.indigo.comfortable.standard", "dark.indigo.comfortable.standard"]],
    ])
  })

  it("groups variants by device, so a flow replays once per device", () => {
    const plans = expandFlowMatrix("full", THEME_AXES)
    const devices = plans.map((plan) => plan.device.id)
    expect(devices).toEqual(["desktop", "tablet", "mobile", "landscape", "reflow"])
    expect(new Set(devices).size).toBe(devices.length)
    expect(plans[0]?.device).toBe(DEVICE_PROFILES.desktop)
  })

  it("samples wide presets pairwise: every two values meet, far below the full cross", () => {
    const variants = expandFlowMatrix("full", THEME_AXES).flatMap((plan) =>
      plan.variants.map((variant) => ({ device: plan.device.id, ...variant })),
    )
    const full = 5 * 2 * 9 * 2 * 5
    expect(variants.length).toBeLessThan(full / 5)
    const meets = (a: string, b: string) =>
      variants.some(
        (variant) => Object.values(variant).includes(a) && Object.values(variant).includes(b),
      )
    for (const theme of THEME_AXES.themes) {
      for (const device of ["desktop", "reflow"]) expect(meets(theme, device)).toBe(true)
      expect(meets(theme, "dark")).toBe(true)
      expect(meets(theme, "compact")).toBe(true)
    }
    expect(meets("forced-colors", "mobile")).toBe(true)
  })

  it("covers every brand theme in both modes for the themes preset", () => {
    const [desktop] = expandFlowMatrix("themes", THEME_AXES)
    const cells = new Set(desktop?.variants.map((variant) => `${variant.mode}.${variant.theme}`))
    expect(cells.size).toBe(18)
  })

  it("keeps a variant's id tied to its values, not its position", () => {
    const narrow = expandFlowMatrix(
      { ...MATRIX_PRESETS.quick, themes: ["indigo"] },
      THEME_AXES,
    )[0]?.variants.map((variant) => variant.id)
    const wide = expandFlowMatrix(
      { ...MATRIX_PRESETS.quick, sampling: "all", themes: ["rose", "indigo"] },
      THEME_AXES,
    )[0]?.variants.map((variant) => variant.id)
    for (const id of narrow ?? []) expect(wide).toContain(id)
  })

  it("collapses the theme axes to one value for a host without brand themes", () => {
    expect(ids(expandFlowMatrix("quick"))[0]).toEqual([
      "desktop",
      ["light.default.default.standard", "dark.default.default.standard"],
    ])
  })

  it("drops duplicate values so no variant is captured twice", () => {
    const [plan] = expandFlowMatrix(
      { ...MATRIX_PRESETS.quick, devices: ["mobile", "mobile"], modes: ["dark", "dark"] },
      THEME_AXES,
    )
    expect(plan?.variants.map((variant) => variant.id)).toEqual([
      "dark.indigo.comfortable.standard",
    ])
  })

  it("rejects an empty axis and a value the host does not define", () => {
    const reject = (spec: Parameters<typeof expandFlowMatrix>[0]) => {
      try {
        expandFlowMatrix(spec, THEME_AXES)
      } catch (error) {
        return error
      }
      return undefined
    }
    const empty = reject({ ...MATRIX_PRESETS.quick, modes: [] })
    expect(empty).toBeInstanceOf(FlowError)
    expect(empty).toMatchObject({ kind: "flow/definition" })
    expect(reject({ ...MATRIX_PRESETS.quick, themes: ["sepia"] })).toBeInstanceOf(FlowError)
    expect(reject({ ...MATRIX_PRESETS.quick, devices: ["watch" as "desktop"] })).toBeInstanceOf(
      FlowError,
    )
    expect(reject("huge" as "quick")).toBeInstanceOf(FlowError)
  })

  it("rejects theme values that are not slugs, since they name frame files", () => {
    expect(() =>
      expandFlowMatrix("quick", { ...THEME_AXES, themes: ["../x"], defaultTheme: "../x" }),
    ).toThrow(FlowError)
  })
})
