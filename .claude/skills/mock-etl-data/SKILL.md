---
name: mock-etl-data
description: Use when adding, changing, or verifying synthetic CAS mock ETL data (mappings, L2L rows, b15 history) — always via scripts/mock_etl_data.mts and make cas-gen, never by hand-editing generated blocks.
---

# mock-etl-data

Manifest-driven generator for the CAS relationship-casuistics mock family (`docs/superpowers/specs/2026-07-31-operational-casuistics-design.md`). Every byte comes from `scripts/mock_etl_data.manifest.json` — never hand-edit rendered XML, L2L rows, or b15 CSV lines.

## Workflow

```bash
# 1. edit scripts/mock_etl_data.manifest.json (add/change a mapping row)
make cas-gen                                                          # emits CAS XMLs, then the REAL parser over a temp copy -> recipes
node --experimental-strip-types scripts/mock_etl_data.mts --emit l2l  # DWH_CONTROL mock mirror rows
node --experimental-strip-types scripts/mock_etl_data.mts --emit b15  # job-history CSV rows
node --experimental-strip-types scripts/mock_etl_data.mts --check     # must exit 0
```
Raise contract floors (below) in the SAME commit as the data change.

## Manifest schema (`scripts/mock_etl_data.manifest.json`)

`CasManifest`: `family` (`"CAS"`), `creationDate`, `uuidBase`, `dates` (ISO window), `incidentDate`, `incidentMessage`, `jobIdEpoch`, `mappings: CasMapping[]`.

`CasMapping`: `n` (int — drives UUID suffix/jobId/b15 jitter), `name` (`m_CAS_<LAYER>_...`), `layer` (STG/ODS/DWH/CDM/RDM/QDM/ETL/OUTPUT), `ext` (`xml`|`XML` — on-disk extension case), `workflow`, `order`, `sources[]` (`table`, `dbtype` `Flat File`|`Oracle`, `fields[]`), `lookup` (`table`/`inField`/`keyField`/`outField`, or `null`), `targets[]` (`table`, `writeMode`, `partition`, `partitionKey`, `fields[]`), `derived` (`name`/`from[]`/`expr`), `b15` (`cluster`, `baseSeconds`, `spreadSeconds`, `koDates[]`, `koMessage?`).

Field encoding: `"NAME:type:precision[.scale]"`, e.g. `"AMOUNT_RAW:string:30"`, `"AMOUNT:number:18.2"`. Source fields use `string`/`number`/`date`; target fields use Oracle types (`varchar2`/`number`/`date`).

b15 formula (`b15CasRows` in `mock_etl_data.mts`): `dateIndex = dates.indexOf(date)`; `seconds = baseSeconds + ((n*37 + dateIndex*53) % spreadSeconds)`; `status = FAILED` when `date` is in `koDates` OR `date === incidentDate`, else `SUCCESS`; `message` is `koMessage` (falls back to `incidentMessage`) on a KO date, `incidentMessage` on the incident date, else empty.

## Corpus-safety rules

- Parser **never** runs in place — `make cas-gen` only (temp-copies `m_CAS_*` XMLs, runs the real parser there, copies the generated recipe dirs back).
- `DWH_CONTROL` mock mirror (`backend/src/main/resources/mock/DWH_CONTROL/LAYER_TO_LAYER/<LAYER>/statements.sql`) is edited only inside the `--emit l2l` marker block (`-- BEGIN mock_etl_data CAS (generated - do not hand-edit)` … `-- END mock_etl_data CAS`) — everything outside it (SYN rows, real data) is untouched.
- **Never re-run `scripts/gen_b15_history.py` after CAS landed.** It derives each recipe's deterministic profile from its sorted index over ALL recipes referenced in `statements.sql`; adding CAS rows shifts that index for the pre-existing SYN family and silently rewrites their clusters/durations/fail-days (the frozen-generator rule). CAS b15 rows are owned exclusively by `--emit b15`, which rewrites only lines whose recipe starts with `_ETL_m_CAS_` inside the existing per-date CSVs under `backend/src/main/resources/mock/composer/dwh/config/cluster_tuning/inputs/` (skips dates whose directory doesn't already exist — never creates new snapshot dates).

## Extension guide (new casuistic)

1. Append a manifest row: next `n`, a unique `CAS_*` source/target table set, pick a shape (simple / multi-source / lookup / dual-target — see the renderer comment in `mock_etl_data.mts` for the SYN mapping each shape mirrors).
2. Run the workflow above (`make cas-gen` → `--emit l2l` → `--emit b15` → `--check`).
3. Bump floors in the same commit: `CorpusContractTest` (`everyMappingServesDomAndModel`/`everyRecipeServes` size floors + the corpus-caveat comment), `scripts/viewer_sweep.mts` (the `paths.length < 81` threshold), `LayerToLayerContractTest` (`everyConfiguredRecipeExistsInCorpus` floor + add the new recipe(s) to `casFamilyFullyConfigured`).
4. If the new row introduces a genuinely new casuistic *class* (not just another row of an existing shape), extend `scripts/relationships_sweep.mts` too (added by Task 10 of this plan — skip this step if it hasn't landed yet).
