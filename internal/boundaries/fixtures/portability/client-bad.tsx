"use client"

// Fixture: a `./client` component that reaches for a DOM-only global. Under the DOM-free client
// profile, `document` is an unknown name, so a React Native-capable package's `./client` cannot
// depend on the browser.
import { useState } from "react"

export function Title(): React.JSX.Element {
  const [title] = useState(() => document.title)
  return <h1>{title}</h1>
}
