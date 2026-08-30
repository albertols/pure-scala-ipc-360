# ADR-0018: The b15 status vocabulary is data, not law

**Status:** Accepted

## Context

The b15 `status` column was compared against closed literal sets in four places —
`ClusterIndexService`, `ClusterController`, `OperationalService`, and the frontend's
`STATUS_MAP` — all containing only `SUCCESS` and `FAILED`. Those are this corpus's
**anonymized sample** values. A real Composer export writes `FAILURE`, which matched
none of them, so it fell through to `PENDING`: every failed run rendered as **"never
ran"**, and the tab reported `0 KO` on data full of failures. Structurally the same
trap as ADR-0013's hardcoded anchor table, and equally silent.

## Decision

Canonicalise the token once, at the read boundary. `B15Status`
(`service/support/B15Status.java`) is applied inside `B15Reader.parse`, before any
`B15RowDto` exists, so every downstream consumer keeps comparing exactly two literals
and needs no change.

- Canonical output is deliberately today's vocabulary — `SUCCESS` / `FAILED` / `""` —
  so the wire shape, the OpenAPI schema and the frontend contract are unchanged.
- Matching is case-insensitive and trimmed.
- Defaults: OK ← `SUCCESS SUCCEEDED OK COMPLETED DONE`;
  KO ← `FAILURE FAILED ERROR KILLED ABORTED CANCELLED`.
- Configurable via `etl360.b15.status-ok` / `.status-ko`, surfaced as `b15StatusOk` /
  `b15StatusKo` in `config.json` through `scripts/dev.sh` (ADR-0009).
- A configured vocabulary **replaces** the default rather than extending it, so a site
  can reclassify `CANCELLED` as a success rather than only ever adding to KO.
- A non-empty token matching neither list still resolves to `""`, but is **counted and
  reported** by `GET /api/diagnostics` as `b15.unrecognizedStatuses`.

## Consequences

- A failed run is a KO on any export whose dialect is in the lists, without a code change.
- ADR-0013's principle extends one level down: an empty tab named its own cause; a
  **mislabelled** tab now does too.
- The dialect is proven by a `@TempDir` fixture, never by editing corpus data — the
  `m_CAS_*` b15 rows stay manifest-generated and frozen, and no mock floor moves.
- `KILLED`/`ABORTED`/`CANCELLED` defaulting to KO is a judgement call, not a fact;
  it is configurable precisely because sites will disagree.

## Alternatives considered

- **Add `FAILURE` to the four literal comparisons** — fixes one token and leaves the
  same silent trap for the next unknown value, in four places instead of one.
- **Introduce an `OK`/`KO` enum on the wire** — a schema change rippling through every
  consumer and test, to fix a problem that lives entirely at the read boundary.
- **Normalize in the frontend** — leaves the backend's own OK/KO counts wrong.
