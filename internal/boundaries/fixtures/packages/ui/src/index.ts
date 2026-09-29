// Fixture: a stand-in `ui` (L3) surface, imported only by the app kernel (`app/src/ui-leak.ts`) to
// prove the `no-app-into-ui` charter rule bites even though app→ui would be a legal downward import.
// Nothing may flag `ui` itself (it imports nothing).
export const widget = "widget"
