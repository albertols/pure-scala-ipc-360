# ADR-0008: Manifest-driven CAS mock data

**Status:** Accepted

## Context

Sub-project 4 needed a 12-mapping `m_CAS_*` family covering every relationship shape (fan-in, 1→N, N→N, diamond, cross-layer skip, lookup, source-only, consumer-less) end-to-end — XML → recipe → `statements.sql` row → 14-day b15 history — reusable for future casuistics, without hand-authoring 12 XMLs or breaking `gen_b15_history.py`'s index-based determinism (ADR-0006) once CAS names interleave with SYN/real ones.

## Decision

`scripts/mock_etl_data.mts` treats the CAS matrix as one JSON manifest (`mock_etl_data.manifest.json`), rendering every artifact deterministically: `--emit xml` (Powermart XML, SYN-template idiom), `--emit l2l`/`--emit b15` (marker-delimited strip-then-append, byte-idempotent), `--check` (drift, exit 1). Recipes are NOT rendered — `make cas-gen` runs the real parser over a temp copy (never in-place), so recipe/DDL JSON stays byte-faithful. `gen_b15_history.py` is frozen once CAS lands; CAS b15 rows belong to `--emit b15` exclusively.

## Consequences

- New casuistics = one manifest row + re-run the workflow, not new renderer code.
- Two b15 generators now coexist (frozen Python for SYN/real, `--emit b15` for CAS) — documented in CLAUDE.md + the `mock-etl-data` skill to keep them from mixing.
- `relationships_sweep.mts` asserts every shape structurally in `validate-loop`.

## Alternatives considered

- **Hand-author 12 XMLs** — no single source of truth at this volume; rejected.
- **Extend `gen_b15_history.py` for CAS** — index shift rewrites SYN/real rows; rejected, kept frozen instead.
- **Render recipes from the manifest, skip the real parser** — risks drift from actual parser behavior; rejected per CLAUDE.md hard rule 3.
