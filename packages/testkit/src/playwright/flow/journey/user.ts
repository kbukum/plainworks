import type { JSHandle, Locator, Page } from "@playwright/test"
import { findFocusProblems } from "../../checks/focus"
import { FlowError } from "../errors"
import { unguarded } from "./guard"
import type { JourneyMeter } from "./meter"

/**
 * How the device's user drives the page: `keyboard` on a device without touch, where every control
 * is reached with Tab and used with Enter, Space, and the arrow keys; `touch` on a phone or tablet,
 * where controls are tapped.
 */
export type FlowInput = "keyboard" | "touch"

/**
 * The person a flow's actions stand for. Each verb drives the page the way the device's user
 * would and is counted toward the journey's metrics. On a keyboard device a control Tab never
 * reaches is a `keyboard` finding, and each control reached is checked for a visible, uncovered
 * focus indicator. A value typed again into another field is a `redundant-entry` finding.
 *
 * Targets are Playwright locators; prefer role and label queries, as a user finds controls by
 * what they are called.
 */
export interface FlowUser {
  /** Open a URL, as a user following a bookmark. In a budgeted journey, only as the first step. */
  visit(url: string): Promise<void>
  /** Activate a button, link, checkbox, switch, or other control. */
  activate(target: Locator): Promise<void>
  /** Type a value into a field, replacing what it held. */
  type(target: Locator, value: string): Promise<void>
  /** Choose an option by its name from a select, combobox, listbox, or radio group. */
  pick(target: Locator, option: string): Promise<void>
}

/** Options for {@link createFlowUser}. */
export interface FlowUserOptions {
  /** The real page, not a journey's guarded one. */
  readonly page: Page
  readonly input: FlowInput
  readonly meter: JourneyMeter
  /** The action's signal; every step stops when it aborts. */
  readonly signal: AbortSignal
}

// A safety cap on one Tab walk; the walk normally ends when focus comes back to where it began.
const MAX_TAB_STOPS = 1_000

// Space toggles these; Enter activates the rest (WAI-ARIA APG keyboard interface).
const TOGGLES = new Set(["checkbox", "radio", "switch", "menuitemcheckbox", "menuitemradio"])

interface Described {
  readonly role: string
  readonly name: string
  readonly label: string
}

/** A {@link FlowUser} for one checkpoint's action. */
export function createFlowUser(options: FlowUserOptions): FlowUser {
  const { page, input, meter, signal } = options

  const press = async (key: string, focusMove = false): Promise<void> => {
    signal.throwIfAborted()
    await page.keyboard.press(key)
    if (focusMove) meter.moveFocus(1)
  }

  // Walk Tab forward from wherever focus is until the target holds focus, or focus comes back to
  // the first stop: one full cycle, shadow trees and focus traps included.
  const tabTo = async (target: Locator): Promise<boolean> => {
    let first: JSHandle | undefined
    try {
      for (let moves = 0; moves < MAX_TAB_STOPS; moves++) {
        await press("Tab", true)
        if (await holdsFocus(target)) return true
        const here = await page.evaluateHandle(deepActiveElement)
        if (first === undefined) {
          first = here
          continue
        }
        const cycled = await page.evaluate(([a, b]) => a === b, [first, here] as const)
        await here.dispose()
        if (cycled) return false
      }
      return false
    } finally {
      await first?.dispose()
    }
  }

  const reach = async (target: Locator, what: Described): Promise<void> => {
    signal.throwIfAborted()
    await target.waitFor({ state: "visible" })
    if (input === "touch") return
    // A disabled control is not focusable, so wait until it is enabled before walking to it, the
    // way Playwright's own actions wait for it to become actionable.
    const handle = await target.elementHandle()
    try {
      await handle?.waitForElementState("enabled")
    } finally {
      await handle?.dispose()
    }
    // Shift moves nothing, but makes the browser treat focus already there as keyboard focus, so
    // its indicator shows the way a keyboard user would see it.
    if (await holdsFocus(target)) await press("Shift")
    else if (!(await tabTo(target))) {
      meter.report({
        check: "keyboard",
        message: `${what.label} is not reachable with Tab`,
      })
      // Go on from the control, so the rest of the journey is still measured.
      await target.focus()
      return
    }
    for (const problem of await findFocusProblems(page)) {
      meter.report({ check: "focus", message: `${what.label}: ${problem}` })
    }
  }

  // Move the active option with the arrow keys until it is `choice`.
  const arrowTo = async (options: Locator, choice: Locator): Promise<boolean> => {
    signal.throwIfAborted()
    await choice.waitFor({ state: "visible" })
    const wanted = await choice.elementHandle()
    try {
      const count = await options.count()
      for (let presses = 0; presses <= count * 2 + 1; presses++) {
        const at = await options.evaluateAll(activeOption, wanted)
        if (at.wanted === -1) return false
        if (at.active === at.wanted) return true
        await press(at.active === -1 || at.active < at.wanted ? "ArrowDown" : "ArrowUp")
      }
      return false
    } finally {
      await wanted.dispose()
    }
  }

  const unreachableOption = (what: Described, option: string): void =>
    meter.report({
      check: "keyboard",
      message: `option "${option}" of ${what.label} is not reachable with the arrow keys`,
    })

  const tap = async (control: Locator): Promise<void> => {
    signal.throwIfAborted()
    await control.waitFor({ state: "visible" })
    await control.scrollIntoViewIfNeeded()
    signal.throwIfAborted()
    await control.tap()
  }

  const pickRadio = async (group: Locator, what: Described, option: string): Promise<void> => {
    const choice = group.getByRole("radio", { name: option, exact: true })
    if (input === "touch") return tap(choice)
    await reach(group, what)
    if (!(await arrowTo(group.getByRole("radio"), choice))) {
      unreachableOption(what, option)
      return choice.check()
    }
    if (!(await choice.isChecked())) await press("Space")
  }

  const pickFromPopup = async (box: Locator, what: Described, option: string): Promise<void> => {
    if (input === "touch") {
      await tap(box)
      return tap((await popupOptions(page, box)).getByRole("option", { name: option, exact: true }))
    }
    await reach(box, what)
    // Down Arrow opens a combobox's popup (APG combobox pattern).
    await press("ArrowDown")
    const list = await popupOptions(page, box)
    const choice = list.getByRole("option", { name: option, exact: true })
    if (await arrowTo(list.getByRole("option"), choice)) return press("Enter")
    unreachableOption(what, option)
    await choice.click()
  }

  const pickInList = async (list: Locator, what: Described, option: string): Promise<void> => {
    const choice = list.getByRole("option", { name: option, exact: true })
    if (input === "touch") return tap(choice)
    await reach(list, what)
    if (!(await arrowTo(list.getByRole("option"), choice))) {
      unreachableOption(what, option)
      return choice.click()
    }
    if ((await choice.getAttribute("aria-selected")) !== "true") await press("Space")
  }

  return {
    async visit(url) {
      meter.beginVisit()
      await page.goto(url)
    },
    async activate(target) {
      const control = unguarded(target)
      const what = await describe(control, signal)
      meter.record("activations")
      if (input === "touch") return tap(control)
      await reach(control, what)
      await press(TOGGLES.has(what.role) ? "Space" : "Enter")
    },
    async type(target, value) {
      const field = unguarded(target)
      const what = await describe(field, signal)
      meter.record("typedFields")
      const exempt =
        what.role === "searchbox" ||
        (await field.evaluate(
          (element) =>
            element instanceof HTMLInputElement &&
            (element.type === "password" || element.type === "search"),
        ))
      if (!exempt) {
        meter.typed({ path: pathOf(page.url()), name: what.name || what.role }, value)
      }
      if (input === "touch") await tap(field)
      else await reach(field, what)
      signal.throwIfAborted()
      await field.fill(value)
    },
    async pick(target, option) {
      const control = unguarded(target)
      const what = await describe(control, signal)
      meter.record("picks")
      // A native select's own keys and picker belong to the browser, not the app: the user reaches
      // it, and the choice is made the way the platform's picker makes it.
      if (await control.evaluate((element) => element instanceof HTMLSelectElement)) {
        await reach(control, what)
        signal.throwIfAborted()
        await control.selectOption({ label: option })
        return
      }
      if (what.role === "radiogroup") return pickRadio(control, what, option)
      if (what.role === "combobox") return pickFromPopup(control, what, option)
      if (what.role === "listbox") return pickInList(control, what, option)
      if ((await control.getByRole("radio").count()) > 0) return pickRadio(control, what, option)
      throw new FlowError(
        "action",
        `user.pick needs a select, combobox, listbox, or radio group; ${what.label} is a ${what.role}`,
      )
    },
  }
}

// The role and accessible name Playwright computes, read from the first line of the target's ARIA
// snapshot, such as `- button "Run"` or `- textbox "Name": value`. The value is never kept.
async function describe(target: Locator, signal: AbortSignal): Promise<Described> {
  signal.throwIfAborted()
  const snapshot = await target.ariaSnapshot()
  const match = /^- ([\w-]+)(?: "((?:[^"\\]|\\.)*)")?/.exec(snapshot)
  const role = match?.[1] ?? "generic"
  const name = (match?.[2] ?? "").replace(/\\(.)/g, "$1")
  return { role, name, label: name === "" ? role : `${role} "${name}"` }
}

// The options of the popups a combobox controls (`aria-controls` is a list of ids), or of the page
// when it names none.
async function popupOptions(page: Page, box: Locator): Promise<Locator> {
  const ids = (await box.getAttribute("aria-controls"))?.trim().split(/\s+/).filter(Boolean) ?? []
  if (ids.length === 0) return page.locator(":root")
  return page.locator(ids.map((id) => `[id="${id.replace(/["\\]/g, "\\$&")}"]`).join(", "))
}

function pathOf(url: string): string {
  return URL.canParse(url) ? new URL(url).pathname : url
}

const holdsFocus = (target: Locator): Promise<boolean> =>
  target.evaluate((element) => {
    let focused = document.activeElement
    while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement
    return focused !== null && (element === focused || element.contains(focused))
  })

// The functions below run in the page, so each is self-contained.

/** The element holding focus, through open shadow roots; the body when nothing does. */
function deepActiveElement(): Element | null {
  let focused = document.activeElement
  while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement
  return focused
}

/** Where the active option and the wanted one sit among `options`; -1 when absent. */
function activeOption(
  options: (HTMLElement | SVGElement)[],
  wanted: HTMLElement | SVGElement,
): { active: number; wanted: number } {
  let focused = document.activeElement
  while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement
  const descendant = focused?.getAttribute("aria-activedescendant") ?? null
  return {
    active: options.findIndex(
      (option) =>
        option === focused ||
        (descendant !== null && option.id === descendant) ||
        option.hasAttribute("data-highlighted"),
    ),
    wanted: options.indexOf(wanted),
  }
}
