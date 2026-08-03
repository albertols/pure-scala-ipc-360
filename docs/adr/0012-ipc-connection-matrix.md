# ADR-0012: IPC connection adjacency matrix

**Status:** Accepted

## Context

The palette inserted orphans (`{name: "NEW_<TYPE>_<n>", type, fields: []}`), so nothing taught
which IPC entities may legally connect; the corpus shows one sample's 30 pairings, not IPC law.

## Decision

Author a `connections` matrix from IPC semantics and the parser's step model in
`backend/src/main/resources/ipc/ipc-rules.json`; the corpus only **validates** it —
`IpcConnectionsContractTest` asserts all 30 observed pairings are permitted, so an over-strict or
invented matrix fails at once. It ships on `GET /api/ipc/rules`, so the frontend keeps no second
grammar copy. `IpcConnections.fanInVerdict` adds the fan-in rule adjacency cannot express
(nullable `active` — `table`, `java`, `joinerInput` — downgrades `block` to `warn`); being
per-candidate it is asked in batches over `POST /api/ipc/fan-in`, never mirrored client-side.

## Consequences

- The palette teaches the model: illegal candidates render disabled, with the reason shown.
- `NodeConfigDialog` gates Insert on the fragment validating clean, so orphans are unreachable
  by construction for any non-empty draft — a blank canvas keeps one narrow documented bypass.
- A new IPC kind needs an entry, or `IpcConnectionsContractTest` and `recipe_sweep.mts` fail.

## Alternatives considered

- **Derive it from the corpus** — would encode this sample's accidents as IPC law.
- **Insert freely, flag orphans afterwards** — the flag arrives after the damage is on screen.
