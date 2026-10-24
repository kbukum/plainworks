import { FlowError } from "../errors"

// What a journey's user does to a page, and must do through `FlowUser`: every Playwright action
// that types, clicks, moves focus, or navigates, and the raw input devices and element handles
// behind them. Reads and waits stay open.
const ACTIONS = new Set([
  "blur",
  "check",
  "clear",
  "click",
  "dblclick",
  "dispatchEvent",
  "dragAndDrop",
  "dragTo",
  "elementHandle",
  "elementHandles",
  "fill",
  "focus",
  "goBack",
  "goForward",
  "goto",
  "hover",
  "keyboard",
  "mouse",
  "press",
  "pressSequentially",
  "reload",
  "selectOption",
  "selectText",
  "setChecked",
  "setInputFiles",
  "tap",
  "touchscreen",
  "type",
  "uncheck",
  "$",
  "$$",
])

const targets = new WeakMap<object, object>()

/**
 * Guard a journey's page: a Playwright action on it, or on any locator or frame reached from it,
 * throws a `flow/definition` {@link FlowError} that names the `FlowUser` verb to use instead.
 * This keeps every step of a budgeted journey counted and driven the way the device's user drives
 * it. It catches mistakes, not intent: `page.evaluate` can still change the page.
 */
export function guardJourneyPage<T extends object>(page: T): T {
  return guard(page, "page")
}

/** The real object behind a guarded one, for `FlowUser` to drive; anything else as it is. */
export function unguarded<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value
  const target = targets.get(value)
  // The map only ever pairs a proxy with the object it wraps, so the types agree.
  return target === undefined ? value : (target as T)
}

function guard<T extends object>(target: T, kind: string): T {
  const proxy = new Proxy(target, {
    get(object, property) {
      if (typeof property === "string" && ACTIONS.has(property)) {
        throw new FlowError(
          "definition",
          `${kind}.${property} is not allowed in a journey: drive the page with user.visit, user.activate, user.type, or user.pick`,
        )
      }
      const value: unknown = Reflect.get(object, property, object)
      if (typeof value !== "function") return value
      return (...args: unknown[]): unknown => wrap(Reflect.apply(value, object, args))
    },
  })
  targets.set(proxy, target)
  return proxy
}

function wrap(value: unknown): unknown {
  if (value instanceof Promise) return value.then(wrap)
  if (Array.isArray(value)) return value.map(wrap)
  const kind = kindOf(value)
  return kind === undefined || typeof value !== "object" || value === null
    ? value
    : guard(value, kind)
}

// What a returned object is, when a page can be acted on through it: a page, frame, or locator
// (anything a further locator can be reached from), or the browser context that holds the pages.
function kindOf(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined
  if (has(value, "pages")) return "context"
  if (!has(value, "getByRole")) return undefined
  if (has(value, "mainFrame")) return "page"
  if (has(value, "parentFrame")) return "frame"
  return "locator"
}

const has = (value: object, method: string): boolean =>
  method in value && typeof Reflect.get(value, method) === "function"
