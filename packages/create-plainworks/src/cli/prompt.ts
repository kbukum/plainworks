import { createInterface } from "node:readline/promises"

// The default {@link PromptFn} implementation: a one-line stdin question. Kept in its own module so
// the option-resolution logic depends only on the seam, never on `readline` — tests inject a pure
// prompt instead. An empty answer accepts the offered fallback.

/** Ask one question on stdin, returning the trimmed answer or `fallback` when the answer is empty. */
export async function readlinePrompt(question: string, fallback: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await rl.question(`${question} (${fallback}): `)
    const trimmed = answer.trim()
    return trimmed === "" ? fallback : trimmed
  } finally {
    rl.close()
  }
}
