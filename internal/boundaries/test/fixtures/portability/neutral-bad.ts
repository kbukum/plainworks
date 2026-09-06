// Fixture: a neutral `.` entry that reaches for a DOM-only global. Under the ES2023-only lib (no DOM
// lib, no ambient @types), `document` is an unknown name, so the portability gate rejects it at
// compile time — proving a host-dependent module cannot slip through the neutral entry.
export function touchDom(): string {
  return document.title
}
