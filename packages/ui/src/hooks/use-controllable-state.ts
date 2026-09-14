import { useCallback, useEffect, useRef, useState } from "react"

/** A state update: the next value, or a function deriving it from the current value. */
export type StateUpdater<T> = T | ((previous: T) => T)

/** Options for {@link useControllableState}. */
export interface UseControllableStateOptions<T> {
  /**
   * The controlled value. When defined, the hook is *controlled*: it never mutates internal state
   * and only reports changes through {@link UseControllableStateOptions.onChange}. Passing
   * `undefined` (the default) makes the hook uncontrolled, seeded by `defaultValue`.
   */
  readonly value?: T | undefined
  /** The initial value while the hook is uncontrolled. */
  readonly defaultValue: T
  /** Called with every requested next value, in both controlled and uncontrolled mode. */
  readonly onChange?: ((value: T) => void) | undefined
}

/**
 * The controlled/uncontrolled state primitive every plainworks component is built on. It resolves
 * the current value from a `value` prop when present, otherwise from internal state, and always
 * reports the requested next value through `onChange` — so a consumer can adopt either mode without
 * the component branching on it. Controlled-first: a defined `value` prop wins.
 */
export function useControllableState<T>(
  options: UseControllableStateOptions<T>,
): readonly [T, (next: StateUpdater<T>) => void] {
  const { value, defaultValue, onChange } = options
  const isControlled = value !== undefined
  const [uncontrolled, setUncontrolled] = useState<T>(defaultValue)
  const current = isControlled ? value : uncontrolled

  // In uncontrolled mode, mirror the internal state in a ref that updates synchronously on
  // setValue, enabling batched functional updaters within one event loop without waiting for
  // re-renders. In controlled mode, the prop is the sole source of truth; functional updates derive
  // from the current prop so rejected updates never poison subsequent functional updates.
  const valueRef = useRef(current)

  useEffect(() => {
    if (!isControlled) {
      valueRef.current = uncontrolled
    }
  }, [isControlled, uncontrolled])

  const setValue = useCallback(
    (next: StateUpdater<T>) => {
      const base = isControlled ? value : valueRef.current
      const resolved = typeof next === "function" ? (next as (previous: T) => T)(base) : next
      if (!isControlled) {
        valueRef.current = resolved
        setUncontrolled(resolved)
      }
      onChange?.(resolved)
    },
    [isControlled, value, onChange],
  )

  return [current, setValue] as const
}
