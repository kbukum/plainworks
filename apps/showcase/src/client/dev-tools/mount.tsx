"use client"

import "./styles.css"

import type { HttpClient } from "@plainworks/http"
import { createRoot, type Root } from "react-dom/client"
import { DevToolsPanel } from "./dev-tools-panel"

/** Mount the development inspector in an isolated root after the main app has hydrated. */
export function mountDevTools(client: HttpClient): () => void {
  const container = document.createElement("div")
  container.dataset.showcaseDevTools = ""
  document.body.append(container)
  const root: Root = createRoot(container)
  root.render(<DevToolsPanel client={client} />)
  return () => {
    root.unmount()
    container.remove()
  }
}
