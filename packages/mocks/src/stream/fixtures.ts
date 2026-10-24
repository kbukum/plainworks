// The channel's own wire contract, maintained with it: SSE protocol frames, acknowledgement and
// snapshot convergence sequences, and list shapes. Any server that implements the channel protocol
// must produce these.
export const protocolFixture = {
  version: 1,
  epoch: "00000000000000000000000000000001",
  cases: [
    {
      name: "connected",
      cursor: "",
      status: 200,
      wire: 'event: connected\ndata: {"cursor":"00000000000000000000000000000001:2","epoch":"00000000000000000000000000000001"}\n\n',
    },
    {
      name: "authorized-replay",
      cursor: "00000000000000000000000000000001:0",
      status: 200,
      wire: 'id: 00000000000000000000000000000001:2\nevent: google.protobuf.Method\ndata: {"name":"visible","requestTypeUrl":"request"}\n\n',
    },
    {
      name: "malformed",
      cursor: "invalid",
      status: 422,
      wire: "",
    },
    {
      name: "future",
      cursor: "00000000000000000000000000000001:3",
      status: 422,
      wire: "",
    },
    {
      name: "second-instance",
      cursor: "00000000000000000000000000000002:2",
      status: 200,
      wire: 'event: reset\ndata: {"reason":"epochChanged","cursor":"00000000000000000000000000000001:2"}\n\n',
    },
    {
      name: "evicted",
      cursor: "00000000000000000000000000000001:0",
      status: 200,
      wire: 'event: reset\ndata: {"reason":"replayExpired","cursor":"00000000000000000000000000000001:3"}\n\n',
    },
    {
      name: "overflow",
      cursor: "",
      status: 200,
      wire: 'event: reset\ndata: {"reason":"overflow","cursor":"00000000000000000000000000000001:4"}\n\n',
    },
  ],
} as const
export const convergenceFixture = {
  version: 1,
  maxRefetches: 2,
  cases: [
    {
      name: "acknowledge-only-applied-events-and-ignore-duplicates",
      operations: [
        {
          kind: "event",
          sequence: 1,
        },
        {
          kind: "reconnect",
          wantSequence: 0,
        },
        {
          kind: "apply",
          sequence: 1,
        },
        {
          kind: "event",
          sequence: 1,
        },
        {
          kind: "apply",
          sequence: 1,
        },
        {
          kind: "apply",
          sequence: 4,
        },
        {
          kind: "reconnect",
          wantSequence: 4,
        },
      ],
      want: {
        acknowledged: 4,
        applied: 2,
        generation: 0,
        refetches: 0,
        accepted: 0,
        dirty: true,
      },
    },
    {
      name: "live-event-racing-snapshot-cannot-roll-back-state",
      operations: [
        {
          kind: "snapshotStart",
        },
        {
          kind: "apply",
          sequence: 2,
        },
        {
          kind: "snapshotComplete",
        },
        {
          kind: "snapshotStart",
        },
        {
          kind: "snapshotComplete",
        },
      ],
      want: {
        acknowledged: 2,
        applied: 1,
        generation: 0,
        refetches: 2,
        accepted: 1,
        dirty: false,
      },
    },
    {
      name: "reset-during-refetch-invalidates-old-generation",
      operations: [
        {
          kind: "apply",
          sequence: 5,
        },
        {
          kind: "snapshotStart",
        },
        {
          kind: "reset",
        },
        {
          kind: "snapshotComplete",
        },
        {
          kind: "snapshotStart",
        },
        {
          kind: "snapshotComplete",
        },
      ],
      want: {
        acknowledged: 0,
        applied: 1,
        generation: 1,
        refetches: 2,
        accepted: 1,
        dirty: false,
      },
    },
    {
      name: "repeated-resets-coalesce-one-refetch",
      operations: [
        {
          kind: "reset",
        },
        {
          kind: "reset",
        },
        {
          kind: "snapshotStart",
        },
        {
          kind: "snapshotStart",
        },
        {
          kind: "snapshotComplete",
        },
      ],
      want: {
        acknowledged: 0,
        applied: 0,
        generation: 2,
        refetches: 1,
        accepted: 1,
        dirty: false,
      },
    },
    {
      name: "continuous-churn-stops-at-budget-with-stale-state",
      operations: [
        {
          kind: "snapshotStart",
        },
        {
          kind: "apply",
          sequence: 1,
        },
        {
          kind: "snapshotComplete",
        },
        {
          kind: "snapshotStart",
        },
        {
          kind: "reset",
        },
        {
          kind: "snapshotComplete",
        },
        {
          kind: "snapshotStart",
        },
      ],
      want: {
        acknowledged: 0,
        applied: 1,
        generation: 1,
        refetches: 2,
        accepted: 0,
        dirty: true,
      },
    },
  ],
} as const
export const listsFixture = [
  {
    name: "offset-default",
    mode: "offset",
    page: 0,
    pageSize: 0,
    expected: {
      data: [
        {
          id: 1,
        },
        {
          id: 2,
        },
        {
          id: 3,
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 3,
        totalPages: 1,
      },
    },
  },
  {
    name: "negative-size-is-default",
    mode: "offset",
    page: 1,
    pageSize: -1,
    expected: {
      data: [
        {
          id: 1,
        },
        {
          id: 2,
        },
        {
          id: 3,
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 3,
        totalPages: 1,
      },
    },
  },
  {
    name: "oversize-is-clamped",
    mode: "offset",
    page: 1,
    pageSize: 101,
    expected: {
      data: [
        {
          id: 1,
        },
        {
          id: 2,
        },
        {
          id: 3,
        },
      ],
      pagination: {
        page: 1,
        pageSize: 100,
        total: 3,
        totalPages: 1,
      },
    },
  },
  {
    name: "empty-offset-page",
    mode: "offset",
    page: 3,
    pageSize: 2,
    expected: {
      data: [],
      pagination: {
        page: 3,
        pageSize: 2,
        total: 3,
        totalPages: 2,
      },
    },
  },
  {
    name: "terminal-cursor-is-absent",
    mode: "cursor",
    page: 0,
    pageSize: 3,
    expected: {
      data: [
        {
          id: 1,
        },
        {
          id: 2,
        },
        {
          id: 3,
        },
      ],
      pagination: {
        pageSize: 3,
      },
    },
  },
] as const
