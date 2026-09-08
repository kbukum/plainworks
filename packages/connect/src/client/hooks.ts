"use client"

// React bindings for `@plainworks/connect`, re-exported from connect-query. connect-query is the
// canonical, actively-maintained Connect ↔ TanStack Query binding, so the kit leans on its hooks
// and DI context rather than reimplementing them. `TransportProvider` is connect-query's own
// context — provide the kit's transport (from `createConnectRpcTransport`) through it, never a
// module-level client, and never wrap a second context.
export {
  TransportProvider,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
  useTransport,
} from "@connectrpc/connect-query"
