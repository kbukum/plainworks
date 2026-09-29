"use client"

// Fixture: a React Native-capable `./client` component. It uses React state and the universal Web
// globals only, so it compiles under the DOM-free client profile.
import { useState } from "react"

export function Counter(): React.JSX.Element {
  const [count, setCount] = useState(0)
  return (
    <button type="button" onClick={() => setCount(count + 1)}>
      {count}
    </button>
  )
}
