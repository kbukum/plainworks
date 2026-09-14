import { useCallback, useMemo } from "react"
import { useControllableState } from "./use-controllable-state"

/** Options for {@link useDisclosure}. */
export interface UseDisclosureOptions {
  /** Controlled open state; when defined the hook never owns the value. */
  readonly open?: boolean | undefined
  /** Initial open state while uncontrolled. Defaults to closed. */
  readonly defaultOpen?: boolean | undefined
  /** Called with the requested next open state. */
  readonly onOpenChange?: ((open: boolean) => void) | undefined
}

/** The open/close state a modal, drawer, or popover is driven by. */
export interface Disclosure {
  readonly open: boolean
  readonly setOpen: (open: boolean) => void
  readonly toggle: () => void
  readonly onOpen: () => void
  readonly onClose: () => void
}

/**
 * Controlled/uncontrolled open-state for overlay surfaces. Wraps {@link useControllableState} with
 * the `open`/`onOpenChange` vocabulary the whole kit shares, plus intent-named helpers so callers
 * never pass a literal boolean.
 */
export function useDisclosure(options: UseDisclosureOptions = {}): Disclosure {
  const [open, setOpen] = useControllableState<boolean>({
    value: options.open,
    defaultValue: options.defaultOpen ?? false,
    onChange: options.onOpenChange,
  })

  const toggle = useCallback(() => setOpen((previous) => !previous), [setOpen])
  const onOpen = useCallback(() => setOpen(true), [setOpen])
  const onClose = useCallback(() => setOpen(false), [setOpen])

  return useMemo(
    () => ({ open, setOpen, toggle, onOpen, onClose }),
    [open, setOpen, toggle, onOpen, onClose],
  )
}
