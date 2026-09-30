"use client"

import "@plainworks/devtools/styles.css"

// The DOM side of the inspector: the shell and its styles. The launcher loads this module lazily,
// only inside the host's development gate, so it never appears in a production bundle.
export { mountDevtools } from "@plainworks/devtools/client"
