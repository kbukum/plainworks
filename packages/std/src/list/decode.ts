import { RemoteFailure } from "../failure"
import { isCursorInfo, isPageInfo } from "./guards"
import type { CursorInfo, CursorResult, PageInfo, PaginatedResult } from "./result"

/** Generated protobuf messages permit an absent pagination message until decoded. */
export type ListResponse<T, Pagination> = {
  readonly data: readonly T[]
  readonly pagination?: Pagination | undefined
}

/** Missing or malformed list metadata is an upstream decode failure, not an empty page. */
export class ListDecodeError extends RemoteFailure<"list/decode"> {
  override readonly name: string = "ListDecodeError"
  constructor() {
    super("list/decode", {
      code: "EXTERNAL_SERVICE_ERROR",
      message: "The service returned invalid list pagination.",
      violations: [],
      retryable: false,
    })
  }
}

export function decodeOffsetList<T>(value: ListResponse<T, PageInfo>): PaginatedResult<T> {
  if (!isPageInfo(value.pagination)) throw new ListDecodeError()
  return { ...value, pagination: value.pagination }
}

export function decodeCursorList<T>(value: ListResponse<T, CursorInfo>): CursorResult<T> {
  if (!isCursorInfo(value.pagination)) throw new ListDecodeError()
  return { ...value, pagination: value.pagination }
}
