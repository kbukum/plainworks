"use client"

import { createContext, type ReactElement, type ReactNode, useContext } from "react"
import { type DevtoolsLabels, defaultDevtoolsLabels } from "./devtools-labels"

const DevtoolsLabelsContext = createContext<DevtoolsLabels>(defaultDevtoolsLabels)

/** Props for {@link DevtoolsLabelsProvider}. */
export interface DevtoolsLabelsProviderProps {
  /** The resolved copy: the host's overrides already merged over the defaults. */
  readonly labels: DevtoolsLabels
  readonly children: ReactNode
}

/** Provide the resolved devtools copy to every view beneath the shell. */
export function DevtoolsLabelsProvider({
  labels,
  children,
}: DevtoolsLabelsProviderProps): ReactElement {
  return <DevtoolsLabelsContext value={labels}>{children}</DevtoolsLabelsContext>
}

/** The devtools copy in effect: the shell's resolved labels, or the English defaults outside it. */
export function useDevtoolsLabels(): DevtoolsLabels {
  return useContext(DevtoolsLabelsContext)
}
