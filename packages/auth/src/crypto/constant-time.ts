/**
 * Constant-time byte comparison — the timing-safe equality every MAC/token check uses so a
 * byte-by-byte early return cannot leak how much of a forged tag was correct. Host-neutral (pure
 * arithmetic), so it lives in the `.` graph and is reused by the session-cookie signer and the CSRF
 * token verifier alike.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  // Length is not itself secret for a fixed-width MAC/tag, and comparing mismatched lengths byte
  // for byte would still leak, so reject unequal lengths up front and fold every byte of
  // equal-length inputs into one accumulator that is only read once.
  if (a.length !== b.length) {
    return false
  }
  let diff = 0
  for (let index = 0; index < a.length; index++) {
    diff |= (a[index] as number) ^ (b[index] as number)
  }
  return diff === 0
}
