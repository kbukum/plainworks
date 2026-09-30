/** The most characters a page-controlled message keeps: enough to act on, bounded for a report. */
export const MAX_MESSAGE_CHARS = 4_000

/**
 * Cut a message the page controls, such as a console line, to `maxChars`, and mark the cut. One
 * enormous message then cannot grow memory or fill a report.
 */
export function boundMessage(text: string, maxChars: number = MAX_MESSAGE_CHARS): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}…(cut at ${maxChars} chars)` : text
}
