"use client"

// Client public entry for `@plainworks/connect` — a re-export-only barrel over the React binding
// (connect-query hooks + the `TransportProvider` DI context). Never re-exports the server `.`
// barrel. The per-module `"use client"` directive makes tsdown emit this (and only the client graph)
// as the `./client` entry, keeping the neutral `.` entry clean.
export {
  TransportProvider,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
  useTransport,
} from "./client/hooks"
