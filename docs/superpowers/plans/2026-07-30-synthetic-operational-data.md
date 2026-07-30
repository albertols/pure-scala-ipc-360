# Synthetic Operational Data & Loop-Validation Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Committed synthetic operational data (SYN mapping family, mock LayerToLayerConfig `statements.sql`, 14-day b15 CSV history) served by three new read-only endpoints, consumed by typed frontend hooks, gated by a `make validate-loop` harness — per spec `docs/superpowers/specs/2026-07-30-synthetic-operational-data-design.md`.

**Architecture:** Backend gains `LayerToLayerService` (purpose-built INSERT tokenizer over the mock `statements.sql` mirror), `OperationalService` (dated b15 CSV snapshots via jackson-dataformat-csv), `RelationshipService` (nodes/edges graph joining LayerToLayerConfig with the corpus), all behind `RelationshipController`/`OperationalController`. `DataRoots` gains the composer mock tier. Frontend gains hooks only. No GUI changes.

**Tech Stack:** Java 17 / Spring Boot 3.3.4 (existing backend module), jackson-dataformat-csv (Boot-managed version), Python 3 stdlib (generator script), vitest 4 + MSW (existing frontend infra).

## Global Constraints

- **Zero GUI changes.** No component markup/style/layout edits. The single sanctioned exception: one `LAYER_COLORS` entry for the new `OUTPUT` layer in `Sidebar.tsx` (Task 11), using an existing `:root` token value — same data-completeness precedent as Foundation Task 12.
- **SYN naming:** every synthetic artifact name carries the marker: mappings `m_SYN_*`, tables `*_SYN_*` or `SYN_*`. Never real-looking production identifiers.
- **Corpus safety:** parser generation ONLY over temp copies (`rsync` the XMLs out, run, copy outputs back). Never run `exec:java` with `--xmlPath` pointing at `parser/src/main/resources/xmltobq`.
- **Mock-only roots:** all mock data under `backend/src/main/resources/mock/`. Never touch/commit `parser/src/main/resources/DWH_CONTROL/` or `parser/src/main/resources/composer/`.
- **Determinism:** `scripts/gen_b15_history.py` uses `random.Random(seed)`, sorted iteration, no wall-clock reads. Same inputs ⇒ byte-identical CSVs. Committed CSVs = artifact of record. Anchor window fixed: `2026_07_16`…`2026_07_29` (14 days).
- **LayerToLayer ingestion reads exactly** `<dwhControl>/LAYER_TO_LAYER/{STG,ODS,DWH,CDM,RDM,QDM,ETL,OUTPUT}/statements.sql`; everything else ignored.
- **Corpus contract floors after Task 2:** ≥69 mappings, ≥74 recipes.
- **Commit protocol:** tick this plan's checkboxes and include this file in each task's commit; stage explicit paths only — NEVER `git add -A` (untracked `first_prompt.md` at repo root must stay uncommitted).
- **Branch:** all work on `feat/etl360-synthetic-operational`.
- **Endpoints/problem+json:** follow the existing `ApiExceptionHandler` idiom — `NotFoundException`→404, new `InvalidDateException`→400 "Invalid date", catch-all 500 stays last-resort.

## Progress & resume protocol

After each task: tick its checkboxes here, include this file in the commit. To resume after interruption: `git log --oneline` + first unticked checkbox = next step.

---

### Task 1: Synthetic XML template — validate against the real parser

The riskiest assumption first: a hand-authored minimal Powermart XML must yield a `_ETL_*.json` recipe from the real CLI. Everything else builds on this template.

**Files:**
- Create: `parser/src/main/resources/xmltobq/STG/m_SYN_STG_L_ORDERS_LOAD.xml`
- Create (generated): `parser/src/main/resources/xmltobq/STG/m_SYN_STG_L_ORDERS_LOAD/` output dir (recipe + DDL JSONs)

**Interfaces:**
- Produces: the validated XML template every Task 2 mapping copies; the `STG/` corpus layer (new — the real corpus has CDM/DWH/ETL/ODS/QDM/RDM only).

- [x] **Step 1: Study the smallest real corpus XML for required structure**

```bash
cd parser/src/main/resources/xmltobq
ls -S ODS/*.xml CDM/*.xml | tail -3   # smallest real XMLs
```
Read the smallest one end-to-end. Note which elements beyond `SOURCE/TARGET/TRANSFORMATION/MAPPING` exist (e.g. `INSTANCE`, `CONNECTOR`, `TARGETLOADORDER`, session/config blocks) and which attributes the `MAPPING` block's instances carry. The template below is the starting point — extend it with whatever the real file shows is structurally required, keeping SYN names.

- [x] **Step 2: Author the template XML**

`parser/src/main/resources/xmltobq/STG/m_SYN_STG_L_ORDERS_LOAD.xml` — starting point (adjust per Step 1 findings):

```xml
<?xml version="1.0" encoding="Windows-1252"?>
<POWERMART CREATION_DATE="01/07/2026 00:00:00" REPOSITORY_VERSION="188.97">
  <REPOSITORY NAME="REP_SYN" VERSION="188" CODEPAGE="MS1252" DATABASETYPE="Oracle">
    <FOLDER NAME="SYN_ORDERS" GROUP="" OWNER="syn" SHARED="NOTSHARED" DESCRIPTION="Synthetic scenario family (sub-project 4)" PERMISSIONS="rwx------" UUID="00000000-0000-0000-0000-000000000401">
      <SOURCE DBDNAME="SYNDB" DATABASETYPE="Flat File" NAME="SYN_FF_ORDERS" OWNERNAME="SYN">
        <SOURCEFIELD DATATYPE="string" NAME="ORDER_ID" PRECISION="20" SCALE="0" NULLABLE="NOTNULL"/>
        <SOURCEFIELD DATATYPE="string" NAME="CUSTOMER_ID" PRECISION="20" SCALE="0" NULLABLE="NOTNULL"/>
        <SOURCEFIELD DATATYPE="string" NAME="AMOUNT_RAW" PRECISION="30" SCALE="0" NULLABLE="NULL"/>
      </SOURCE>
      <TARGET DATABASETYPE="Oracle" NAME="STG_L_SYN_ORDERS">
        <TARGETFIELD DATATYPE="varchar2" NAME="ORDER_ID" PRECISION="20" SCALE="0" NULLABLE="NOTNULL"/>
        <TARGETFIELD DATATYPE="varchar2" NAME="CUSTOMER_ID" PRECISION="20" SCALE="0" NULLABLE="NOTNULL"/>
        <TARGETFIELD DATATYPE="number" NAME="AMOUNT" PRECISION="18" SCALE="2" NULLABLE="NULL"/>
      </TARGET>
      <TRANSFORMATION DESCRIPTION="" NAME="EXP_SYN_CLEAN" OBJECTVERSION="1" REUSABLE="NO" TYPE="Expression" VERSIONNUMBER="1">
        <TRANSFORMFIELD DATATYPE="string" NAME="ORDER_ID" PORTTYPE="INPUT/OUTPUT" PRECISION="20" SCALE="0"/>
        <TRANSFORMFIELD DATATYPE="string" NAME="CUSTOMER_ID" PORTTYPE="INPUT/OUTPUT" PRECISION="20" SCALE="0"/>
        <TRANSFORMFIELD DATATYPE="string" NAME="AMOUNT_RAW" PORTTYPE="INPUT" PRECISION="30" SCALE="0"/>
        <TRANSFORMFIELD DATATYPE="decimal" NAME="AMOUNT" PORTTYPE="OUTPUT" PRECISION="18" SCALE="2" EXPRESSION="TO_DECIMAL(LTRIM(RTRIM(AMOUNT_RAW)))"/>
      </TRANSFORMATION>
      <MAPPING DESCRIPTION="Synthetic STG load" ISVALID="YES" NAME="m_SYN_STG_L_ORDERS_LOAD" OBJECTVERSION="1" VERSIONNUMBER="1">
        <CONNECTOR FROMINSTANCE="SYN_FF_ORDERS" FROMINSTANCETYPE="Source Definition" FROMFIELD="ORDER_ID" TOINSTANCE="EXP_SYN_CLEAN" TOINSTANCETYPE="Expression" TOFIELD="ORDER_ID"/>
        <CONNECTOR FROMINSTANCE="SYN_FF_ORDERS" FROMINSTANCETYPE="Source Definition" FROMFIELD="CUSTOMER_ID" TOINSTANCE="EXP_SYN_CLEAN" TOINSTANCETYPE="Expression" TOFIELD="CUSTOMER_ID"/>
        <CONNECTOR FROMINSTANCE="SYN_FF_ORDERS" FROMINSTANCETYPE="Source Definition" FROMFIELD="AMOUNT_RAW" TOINSTANCE="EXP_SYN_CLEAN" TOINSTANCETYPE="Expression" TOFIELD="AMOUNT_RAW"/>
        <CONNECTOR FROMINSTANCE="EXP_SYN_CLEAN" FROMINSTANCETYPE="Expression" FROMFIELD="ORDER_ID" TOINSTANCE="STG_L_SYN_ORDERS" TOINSTANCETYPE="Target Definition" TOFIELD="ORDER_ID"/>
        <CONNECTOR FROMINSTANCE="EXP_SYN_CLEAN" FROMINSTANCETYPE="Expression" FROMFIELD="CUSTOMER_ID" TOINSTANCE="STG_L_SYN_ORDERS" TOINSTANCETYPE="Target Definition" TOFIELD="CUSTOMER_ID"/>
        <CONNECTOR FROMINSTANCE="EXP_SYN_CLEAN" FROMINSTANCETYPE="Expression" FROMFIELD="AMOUNT" TOINSTANCE="STG_L_SYN_ORDERS" TOINSTANCETYPE="Target Definition" TOFIELD="AMOUNT"/>
      </MAPPING>
    </FOLDER>
  </REPOSITORY>
</POWERMART>
```

- [x] **Step 3: Generate over a temp copy**

```bash
TMP=$(mktemp -d)
mkdir -p "$TMP/xmltobq/STG"
cp parser/src/main/resources/xmltobq/STG/m_SYN_STG_L_ORDERS_LOAD.xml "$TMP/xmltobq/STG/"
mvn -q -pl parser compile exec:java -Dexec.args="--xmlPath $TMP/xmltobq --generateDDLContent --generateRecipe --generateTargetDDL --generateSourceDDL"
find "$TMP/xmltobq/STG" -name '*.json'
```
Expected: `$TMP/xmltobq/STG/m_SYN_STG_L_ORDERS_LOAD/_ETL_m_SYN_STG_L_ORDERS_LOAD.json` plus DDL JSON(s), exit 0. If generation fails or produces no recipe: iterate the template guided by Step 1's real-XML structure (add `INSTANCE`/`TARGETLOADORDER` blocks etc.). If three iterations don't converge, STOP and report BLOCKED with the parser log.

- [x] **Step 4: Inspect the generated recipe** — confirm it names `SYN_FF_ORDERS`, `STG_L_SYN_ORDERS`, contains the `TO_DECIMAL` expression, and source refs use `SOURCE_NAME.FIELD_NAME` dot notation. Copy outputs back:

```bash
cp -R "$TMP/xmltobq/STG/m_SYN_STG_L_ORDERS_LOAD" parser/src/main/resources/xmltobq/STG/
```

- [x] **Step 5: Backend still green** — Run: `mvn -q -am -pl backend test`
Expected: PASS (floors are ≥, one extra mapping is fine; the corpus contract test now also serves the new XML's dom+model).

- [x] **Step 6: Commit**

```bash
git add parser/src/main/resources/xmltobq/STG docs/superpowers/plans/2026-07-30-synthetic-operational-data.md
git commit -m "feat(corpus): validated synthetic Powermart template — m_SYN_STG_L_ORDERS_LOAD (STG layer)"
```

---

### Task 2: The remaining 9 SYN mappings + raised corpus floors

**Files:**
- Create: 9 XMLs + their generated output dirs (table below) under `parser/src/main/resources/xmltobq/<LAYER>/`
- Modify: `backend/src/test/java/io/pure360/etl360/CorpusContractTest.java` (floors 59→69, 64→74)

**Interfaces:**
- Consumes: Task 1's validated template (copy it; change only names/fields/expressions per row below).
- Produces: the full SYN family; recipe filenames `_ETL_<mapping>.json` that Tasks 3/9/10 reference.

Per-mapping data (each: template copy, sources/lookups become extra `SOURCE` blocks + connectors, second target = second `TARGET` block + connectors; expressions vary per row; `m_SYN_QDM_ORDERS_QUALITY.XML` uses the **uppercase extension**):

| # | File (under xmltobq/) | Source table(s) | Lookup | Target(s) | Expression to use |
|---|---|---|---|---|---|
| 2 | `STG/m_SYN_STG_L_CUSTOMERS_LOAD.xml` | `SYN_FF_CUSTOMERS` | — | `STG_L_SYN_CUSTOMERS` | `UPPER(LTRIM(RTRIM(CUSTOMER_NAME)))` |
| 3 | `ODS/m_SYN_ODS_ORDERS.xml` | `STG_L_SYN_ORDERS` | `SYN_LKP_CURRENCY` | `ODS_SYN_ORDERS` | `ROUND(AMOUNT * FX_RATE, 2)` |
| 4 | `ODS/m_SYN_ODS_CUSTOMERS.xml` | `STG_L_SYN_CUSTOMERS` | — | `ODS_SYN_CUSTOMERS` | `IIF(ISNULL(CUSTOMER_NAME), 'UNKNOWN', CUSTOMER_NAME)` |
| 5 | `DWH/m_SYN_DWH_ORDERS_FACT.xml` | `ODS_SYN_ORDERS`, `ODS_SYN_CUSTOMERS` | — | `DWH_SYN_ORDERS_FACT` | `TO_CHAR(LOAD_DATE, 'YYYYMMDD')` |
| 6 | `CDM/m_SYN_DM_ORDERS_SUMMARY.xml` | `DWH_SYN_ORDERS_FACT` | `SYN_LKP_CURRENCY` | `DM_SYN_ORDERS_SUMMARY` | `DECODE(COUNT_BAND, 'HIGH', 1, 0)` |
| 7 | `RDM/m_SYN_RDM_ORDERS_EXPORT.xml` | `DM_SYN_ORDERS_SUMMARY` | — | `RDM_SYN_ORDERS_EXPORT` | `SUBSTR(REPORT_KEY, 1, 8)` |
| 8 | `QDM/m_SYN_QDM_ORDERS_QUALITY.XML` | `DWH_SYN_ORDERS_FACT` | — | `QDM_SYN_ORDERS_QUALITY` | `IIF(TOTAL_ROWS = 0, 'KO', 'OK')` |
| 9 | `ETL/m_SYN_ETL_ORDERS_BRIDGE.xml` | `ODS_SYN_ORDERS` | — | `ETL_SYN_ORDERS_BRIDGE`, `ETL_SYN_ORDERS_AUDIT` | `LPAD(ORDER_ID, 20, '0')` |
| 10 | `OUTPUT/m_SYN_OUT_ORDERS_FEED.xml` | `RDM_SYN_ORDERS_EXPORT` | — | `OUT_SYN_ORDERS_FEED` | `ORDER_ID \|\| '-' \|\| TO_CHAR(LOAD_DATE, 'YYYY')` |

Lookup representation: a second `SOURCE` block named as the lookup table plus a `TRANSFORMATION TYPE="Lookup Procedure" NAME="LKP_SYN_CURRENCY"` wired via connectors (mirrors how real corpus XMLs carry lookups — check one real example in `CDM/` and copy its shape).

- [x] **Step 1: Author the 9 XMLs** per the table (SYN names throughout, folder `SYN_ORDERS`, one non-identity expression each — they feed `/api/expressions`).
- [x] **Step 2: Generate all over a temp copy** (same rsync/exec pattern as Task 1 Step 3 but copying the 9 new XMLs; `--include='*.XML'` matters for #8). Copy the 9 output dirs back next to their XMLs.
- [x] **Step 3: Raise the floors** — in `CorpusContractTest.java`: `hasSizeGreaterThanOrEqualTo(59)` → `69`, `hasSizeGreaterThanOrEqualTo(64)` → `74`.
- [x] **Step 4: Full backend suite** — Run: `mvn -q -am -pl backend test`
Expected: PASS — contract test now serves 69 mappings incl. all SYN dom+model and 74 recipes.
- [x] **Step 5: Commit**

```bash
git add parser/src/main/resources/xmltobq backend/src/test/java/io/pure360/etl360/CorpusContractTest.java docs/superpowers/plans/2026-07-30-synthetic-operational-data.md
git commit -m "feat(corpus): SYN mapping family across 8 layers, corpus floors 69/74"
```

---

### Task 3: Mock statements.sql mirror + decoy

**Files:**
- Create: `backend/src/main/resources/mock/DWH_CONTROL/LAYER_TO_LAYER/<L>/statements.sql` for `STG, ODS, DWH, CDM, RDM, QDM, ETL, OUTPUT`
- Create: `backend/src/main/resources/mock/DWH_CONTROL/LAYER_TO_LAYER/ARCHIVE/statements.sql` (decoy, one valid-looking row)
- Modify: `backend/src/main/resources/mock/DWH_CONTROL/README.md` (drop "populated by sub-project 4" phrasing; describe the live layout)

**Interfaces:**
- Produces: the data files Tasks 4/7/9/10 parse. Row format is EXACTLY the first_prompt/spec shape (single line per statement).

Row inventory — 10 synthetic (one per SYN mapping, in its layer's file) + 8 real (verify each recipe exists with `ls` before writing; recipe = `_ETL_<mapping>.json` in the mapping's output dir):

Real picks: `m_DM_INFOHUB_BIZLINK` (CDM), `m_DM_STG_LKP_MEMBER_*` (CDM — `ls parser/src/main/resources/xmltobq/CDM` for the exact name), `m_DWH_MAPLEGROVE_PARTYPROFILE_INSERT` (DWH), `m_DWH_E_MAPLEGROVE_CALLHUB_MAPLEBEND_OAKRIVER` (ETL), `m_ODS_TSX61` (ODS), `m_ODS_MOD_MAPLETHORP_FLOWS` (ODS), `m_GENERATE_ERROR_BRISKGROVE` (QDM), plus one RDM mapping (`ls parser/src/main/resources/xmltobq/RDM`).

Value rules: `mapping_xml_dir` = `src/main/resources/xmltobq/<LAYER>` (the historical path format from the schema's own example); `workflow` = `wf_SYN_<layer>_LOAD` for synthetic, `wf_Carga_<layer>` for real rows; `execution_order` follows the chain (STG=1, ODS=2, DWH=3, CDM=4, RDM=5, QDM=5, ETL=3, OUTPUT=6); sources arrays mirror each mapping's actual sources (`active` true except one inactive somewhere, `day_offset` 0 mostly, one `1`, one `30`); `lookup_tables` non-empty only where the mapping has a lookup; write modes vary (`ORPHAN_WRITE_MODES`, `TRUNCATE_INSERT`, `APPEND`); partitions vary (`DAILY`/`MONTHLY`/`UNKNOWN_PARTITION_TYPE`).

Three verbatim examples (write the remaining 15 by the same rules):

```sql
INSERT INTO CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES ('STG', 'src/main/resources/xmltobq/STG', '_ETL_m_SYN_STG_L_ORDERS_LOAD.json', 'wf_SYN_STG_LOAD', 'STG_L_SYN_ORDERS', 1, [STRUCT('SYN_FF_ORDERS', true, 0)], [], [STRUCT('STG_L_SYN_ORDERS', 'TRUNCATE_INSERT')], [STRUCT('STG_L_SYN_ORDERS', 'DAILY', 'LOAD_DATE', 'UNKNOWN_SUBPARTITION')])
INSERT INTO CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES ('ODS', 'src/main/resources/xmltobq/ODS', '_ETL_m_SYN_ODS_ORDERS.json', 'wf_SYN_ODS_LOAD', 'ODS_SYN_ORDERS', 2, [STRUCT('STG_L_SYN_ORDERS', true, 0)], ['SYN_LKP_CURRENCY'], [STRUCT('ODS_SYN_ORDERS', 'APPEND')], [STRUCT('ODS_SYN_ORDERS', 'DAILY', 'LOAD_DATE', 'UNKNOWN_SUBPARTITION')])
INSERT INTO CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES ('CDM', 'src/main/resources/xmltobq/CDM', '_ETL_m_DM_INFOHUB_BIZLINK.json', 'wf_Carga_CDM', 'DM_INFOHUB_BIZLINK', 4, [STRUCT('DWH_INFOHUB_BASE', true, 1), STRUCT('DWH_BIZLINK_REF', false, 0)], ['LKP_INFOHUB_TYPES'], [STRUCT('DM_INFOHUB_BIZLINK', 'ORPHAN_WRITE_MODES')], [STRUCT('DM_INFOHUB_BIZLINK', 'MONTHLY', 'LOAD_MONTH', 'UNKNOWN_SUBPARTITION')])
```

(Real rows' source/lookup table names may be plausible SYN-free anonymized names like the example — they describe config, not corpus files; only `recipe` must resolve against the corpus.)

- [x] **Step 1: Write the eight statements.sql files** (+ README update).
- [x] **Step 2: Write the decoy** — `ARCHIVE/statements.sql`, one row with recipe `_ETL_m_SYN_DECOY_NEVER_SERVED.json` (deliberately nonexistent — proves exclusion later).
- [x] **Step 3: Verify every non-decoy recipe resolves**

```bash
grep -ho "_ETL_[A-Za-z0-9_]*\.json" backend/src/main/resources/mock/DWH_CONTROL/LAYER_TO_LAYER/{STG,ODS,DWH,CDM,RDM,QDM,ETL,OUTPUT}/statements.sql | sort -u | while read r; do find parser/src/main/resources/xmltobq -name "$r" | grep -q . || echo "MISSING: $r"; done
```
Expected: no output.
- [x] **Step 4: Commit**

```bash
git add backend/src/main/resources/mock/DWH_CONTROL docs/superpowers/plans/2026-07-30-synthetic-operational-data.md
git commit -m "feat(mock): SCALAMATICA_LAYER_TO_LAYER_CONFIG statements.sql mirror (8 layers + decoy)"
```

---

### Task 4: LayerToLayerService — INSERT tokenizer (TDD)

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/api/dto/LayerToLayerEntryDto.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/LayerToLayerService.java`
- Test: `backend/src/test/java/io/pure360/etl360/service/LayerToLayerServiceTest.java`
- Test fixture: `backend/src/test/resources/fixture-mock/DWH_CONTROL/LAYER_TO_LAYER/{ODS,ARCHIVE}/statements.sql`

**Interfaces:**
- Consumes: `DataRoots.dwhControl(): Optional<Path>` (existing).
- Produces: `LayerToLayerService.entries(): List<LayerToLayerEntryDto>`, `LayerToLayerService.skippedRows(): int` — Task 7 (graph) and Task 10 (contract) consume both.

DTO:

```java
package io.pure360.etl360.api.dto;

import java.util.List;

public record LayerToLayerEntryDto(String layer, String mappingXmlDir, String recipe,
                                   String workflow, String target, int executionOrder,
                                   List<SourceRef> sources, List<String> lookupTables,
                                   List<WriteMode> targetsWriteMode, List<Partition> targetPartition) {
    public record SourceRef(String table, boolean active, int dayOffset) {}
    public record WriteMode(String targetTable, String writeMode) {}
    public record Partition(String targetTable, String partitionType, String partitionKey,
                            String subpartitionKey) {}
}
```

- [x] **Step 1: Fixture files** — `fixture-mock/.../ODS/statements.sql` with 3 rows: one full row (all arrays populated, incl. a quoted string containing a comma inside `('a, b')`), one row with empty arrays `[], [], []`-style, one deliberately malformed row (`VALUES ('ODS', broken`). `ARCHIVE/statements.sql`: one valid row (must be ignored).

- [x] **Step 2: Failing test**

```java
package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.LayerToLayerEntryDto;
import io.pure360.etl360.config.DataRoots;
import io.pure360.etl360.config.Etl360Properties;
import org.junit.jupiter.api.Test;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.assertThat;

class LayerToLayerServiceTest {
    private LayerToLayerService service() {
        Path mockRoot = Path.of("src/test/resources/fixture-mock");
        var props = new Etl360Properties("unused", mockRoot.resolve("DWH_CONTROL").toString(),
            mockRoot.toString(), "unused-composer",
            new Etl360Properties.Gcp("p", "r", "u1", "u2", "u3"));
        return new LayerToLayerService(new DataRoots(props));
    }

    @Test
    void parsesRowsSkipsMalformedIgnoresNonLayerDirs() {
        LayerToLayerService s = service();
        assertThat(s.entries()).hasSize(2);            // 3 rows - 1 malformed; ARCHIVE ignored
        assertThat(s.skippedRows()).isEqualTo(1);
        LayerToLayerEntryDto full = s.entries().get(0);
        assertThat(full.layer()).isEqualTo("ODS");
        assertThat(full.sources()).isNotEmpty();
        assertThat(full.sources().get(0).table()).isNotBlank();
        assertThat(full.targetPartition().get(0).partitionType()).isNotBlank();
    }
}
```
(Adjust the `Etl360Properties` construction so `DataRoots` resolves the fixture `DWH_CONTROL` as the real tier — absolute-path the strings if `resolveAgainstRepoRoot` interferes; the existing `DataRootsTest` shows the working pattern.)

- [x] **Step 3: Run to verify failure** — `mvn -q -pl backend test -Dtest=LayerToLayerServiceTest` — compile error.

- [x] **Step 4: Implement.** Service reads the eight fixed dir names only; per file, extract statements with a regex anchor and parse the parenthesized values with a cursor-based tokenizer:

```java
package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.LayerToLayerEntryDto;
import io.pure360.etl360.config.DataRoots;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

@Service
public class LayerToLayerService {
    private static final Logger log = LoggerFactory.getLogger(LayerToLayerService.class);
    static final List<String> LAYER_DIRS = List.of("STG", "ODS", "DWH", "CDM", "RDM", "QDM", "ETL", "OUTPUT");
    private static final String ANCHOR = "INSERT INTO CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES";

    private final DataRoots roots;
    private List<LayerToLayerEntryDto> entries;
    private int skipped;
    private long cachedMtime = -1;

    public LayerToLayerService(DataRoots roots) { this.roots = roots; }

    public synchronized List<LayerToLayerEntryDto> entries() { load(); return entries; }
    public synchronized int skippedRows() { load(); return skipped; }

    private void load() {
        Optional<Path> dwh = roots.dwhControl();
        if (dwh.isEmpty()) { entries = List.of(); skipped = 0; return; }
        Path base = dwh.get().resolve("LAYER_TO_LAYER");
        long newest = LAYER_DIRS.stream().map(d -> base.resolve(d).resolve("statements.sql"))
            .filter(Files::isRegularFile).mapToLong(this::mtime).max().orElse(0);
        if (entries != null && newest == cachedMtime) return;
        List<LayerToLayerEntryDto> out = new ArrayList<>();
        int bad = 0;
        for (String dir : LAYER_DIRS) {
            Path f = base.resolve(dir).resolve("statements.sql");
            if (!Files.isRegularFile(f)) continue;
            for (String stmt : statements(read(f))) {
                try { out.add(parseRow(stmt)); }
                catch (RuntimeException e) { bad++; log.warn("Skipping malformed LayerToLayer row in {}: {}", f, e.getMessage()); }
            }
        }
        entries = List.copyOf(out); skipped = bad; cachedMtime = newest;
    }

    /** Extract the parenthesized VALUES(...) body of each anchored statement (balanced parens, quote-aware). */
    static List<String> statements(String content) {
        List<String> result = new ArrayList<>();
        int idx = 0;
        while ((idx = content.indexOf(ANCHOR, idx)) >= 0) {
            int open = content.indexOf('(', idx + ANCHOR.length());
            if (open < 0) break;
            int depth = 0; boolean inStr = false; int i = open;
            for (; i < content.length(); i++) {
                char c = content.charAt(i);
                if (inStr) { if (c == '\'') inStr = false; }
                else if (c == '\'') inStr = true;
                else if (c == '(') depth++;
                else if (c == ')' && --depth == 0) break;
            }
            if (depth != 0) { result.add(content.substring(open + 1)); break; } // unbalanced → parseRow fails it
            result.add(content.substring(open + 1, i));
            idx = i;
        }
        return result;
    }

    static LayerToLayerEntryDto parseRow(String body) {
        Cursor c = new Cursor(body);
        String layer = c.string();      c.comma();
        String dir = c.string();        c.comma();
        String recipe = c.string();     c.comma();
        String wf = c.string();         c.comma();
        String target = c.string();     c.comma();
        int order = c.integer();        c.comma();
        List<List<Object>> srcs = c.structArray(3);  c.comma();
        List<Object> lookups = c.scalarArray();      c.comma();
        List<List<Object>> wms = c.structArray(2);   c.comma();
        List<List<Object>> parts = c.structArray(4);
        return new LayerToLayerEntryDto(layer, dir, recipe, wf, target, order,
            srcs.stream().map(s -> new LayerToLayerEntryDto.SourceRef((String) s.get(0), (Boolean) s.get(1), (Integer) s.get(2))).toList(),
            lookups.stream().map(o -> (String) o).toList(),
            wms.stream().map(s -> new LayerToLayerEntryDto.WriteMode((String) s.get(0), (String) s.get(1))).toList(),
            parts.stream().map(s -> new LayerToLayerEntryDto.Partition((String) s.get(0), (String) s.get(1), (String) s.get(2), (String) s.get(3))).toList());
    }

    /** Minimal cursor over the VALUES body: 'str' (''-escape), int, true/false, [..], STRUCT(..). */
    static final class Cursor {
        private final String s; private int p = 0;
        Cursor(String s) { this.s = s; }
        private void ws() { while (p < s.length() && Character.isWhitespace(s.charAt(p))) p++; }
        void comma() { ws(); expect(','); }
        private void expect(char ch) { if (p >= s.length() || s.charAt(p) != ch) throw new IllegalArgumentException("expected '" + ch + "' at " + p); p++; }
        String string() {
            ws(); expect('\'');
            StringBuilder b = new StringBuilder();
            while (p < s.length()) {
                char ch = s.charAt(p++);
                if (ch == '\'') { if (p < s.length() && s.charAt(p) == '\'') { b.append('\''); p++; } else return b.toString(); }
                else b.append(ch);
            }
            throw new IllegalArgumentException("unterminated string");
        }
        int integer() { ws(); int st = p; if (p < s.length() && (s.charAt(p) == '-' || s.charAt(p) == '+')) p++; while (p < s.length() && Character.isDigit(s.charAt(p))) p++; if (st == p) throw new IllegalArgumentException("expected int at " + st); return Integer.parseInt(s.substring(st, p)); }
        boolean bool() { ws(); if (s.startsWith("true", p)) { p += 4; return true; } if (s.startsWith("false", p)) { p += 5; return false; } throw new IllegalArgumentException("expected bool at " + p); }
        Object scalar() { ws(); char ch = s.charAt(p); if (ch == '\'') return string(); if (ch == 't' || ch == 'f') return bool(); return integer(); }
        List<Object> scalarArray() { ws(); expect('['); List<Object> out = new ArrayList<>(); ws(); if (s.charAt(p) == ']') { p++; return out; } while (true) { out.add(scalar()); ws(); if (s.charAt(p) == ',') { p++; continue; } expect(']'); return out; } }
        List<List<Object>> structArray(int arity) {
            ws(); expect('['); List<List<Object>> out = new ArrayList<>(); ws();
            if (s.charAt(p) == ']') { p++; return out; }
            while (true) {
                ws(); if (!s.startsWith("STRUCT", p)) throw new IllegalArgumentException("expected STRUCT at " + p); p += 6; expect('(');
                List<Object> fields = new ArrayList<>();
                for (int i = 0; i < arity; i++) { fields.add(scalar()); ws(); if (i < arity - 1) expect(','); }
                ws(); expect(')'); out.add(fields);
                ws(); if (s.charAt(p) == ',') { p++; continue; }
                expect(']'); return out;
            }
        }
    }
    private long mtime(Path p) { try { return Files.getLastModifiedTime(p).toMillis(); } catch (IOException e) { throw new UncheckedIOException(e); } }
    private String read(Path p) { try { return Files.readString(p); } catch (IOException e) { throw new UncheckedIOException(e); } }
}
```

- [x] **Step 5: Run the test** — `mvn -q -pl backend test -Dtest=LayerToLayerServiceTest` — Expected: PASS. Add tokenizer edge tests in the same class: quoted comma survives, `''` escape, empty arrays, malformed row counted not thrown.
- [x] **Step 6: Full suite + commit**

```bash
mvn -q -am -pl backend test
git add backend/src/main/java/io/pure360/etl360/api/dto/LayerToLayerEntryDto.java backend/src/main/java/io/pure360/etl360/service/LayerToLayerService.java backend/src/test/java/io/pure360/etl360/service/LayerToLayerServiceTest.java backend/src/test/resources/fixture-mock docs/superpowers/plans/2026-07-30-synthetic-operational-data.md
git commit -m "feat(backend): LayerToLayerService — quote-aware INSERT tokenizer, malformed-row skip, 8-dir exclusion"
```

---

### Task 5: DataRoots composer mock tier

**Files:**
- Modify: `backend/src/main/java/io/pure360/etl360/config/DataRoots.java`
- Test: `backend/src/test/java/io/pure360/etl360/config/DataRootsTest.java` (add cases)

**Interfaces:**
- Produces: `composer(): Optional<Path>` now real→mock→absent; `composerMode(): "real"|"mock"|"absent"`. Mock tier resolves `<mockRoot>/composer`. (`/api/health` and `/api/config` already surface `composerMode` — no controller change.)

- [x] **Step 1: Failing tests** — add to `DataRootsTest` (mirror the existing dwhControl trio): real composer dir present → `"real"`; only `<mock>/composer` present → `"mock"` and `composer()` contains it; neither → `"absent"`/empty.
- [x] **Step 2: Run to verify failure** — `mvn -q -pl backend test -Dtest=DataRootsTest` — new tests FAIL (composer currently has no mock tier).
- [x] **Step 3: Implement** — extend `composer()`/`composerMode()` with the mock branch exactly like `dwhControl()`'s (`mockRoot.resolve("composer")`). While in the file, apply the parked Foundation refactor if trivial: collapse duplicated isDirectory checks into a shared `(mode, path)` helper for both roots — only if it keeps the diff small and tests green.
- [x] **Step 4: Run** — `mvn -q -pl backend test -Dtest=DataRootsTest` PASS, then full `mvn -q -am -pl backend test` PASS (HealthController test unaffected — mode value changes only when a mock composer dir exists, which arrives in Task 9).
- [x] **Step 5: Commit**

```bash
git add backend/src/main/java/io/pure360/etl360/config/DataRoots.java backend/src/test/java/io/pure360/etl360/config/DataRootsTest.java docs/superpowers/plans/2026-07-30-synthetic-operational-data.md
git commit -m "feat(backend): composer mock tier in DataRoots (real|mock|absent)"
```

---

### Task 6: OperationalService — dated b15 snapshots (TDD)

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/api/dto/B15RowDto.java`, `OperationalSnapshotDto.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/OperationalService.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/support/InvalidDateException.java`
- Modify: `backend/pom.xml` (add `com.fasterxml.jackson.dataformat:jackson-dataformat-csv`, no version — Boot BOM manages)
- Test: `backend/src/test/java/io/pure360/etl360/service/OperationalServiceTest.java`
- Test fixtures: `backend/src/test/resources/fixture-mock/composer/dwh/config/cluster_tuning/inputs/{2026_07_01,2026_07_02}/b15_application_end_with_recipe_null_status.csv`

**Interfaces:**
- Consumes: `DataRoots.composer()` (Task 5).
- Produces: `OperationalService.dates(): List<String>` (ISO `YYYY-MM-DD`, sorted), `snapshot(String isoDate): OperationalSnapshotDto` (throws `NotFoundException` with the operator message when the date dir/file is absent, `InvalidDateException` on malformed input). DTOs:

```java
public record B15RowDto(String clusterName, String recipeFilename, String jobId,
                        String appStartIso, String avgJobDurationInMinsSec,
                        String status, String message) {}
public record OperationalSnapshotDto(String date, java.util.List<B15RowDto> rows) {}
```

`InvalidDateException`: message-only constructor in `service.support` (same shape as `NotFoundException`).

- [x] **Step 1: Fixtures** — two dated dirs. `2026_07_01` CSV (header + 3 rows: one SUCCESS, one FAILED with a quoted message containing a comma, one with empty status/message):

```csv
cluster_name,recipe_filename,job_id,app_start_iso,avg_job_duration_in_mins_sec,status,message
cluster-wf-syn-orders-01,_ETL_m_SYN_ODS_ORDERS.json,application_1774840000001_0001,2026-07-01T04:12:22.644Z,14m 05sec,SUCCESS,
cluster-wf-syn-orders-01,_ETL_m_SYN_DWH_ORDERS_FACT.json,application_1774840000001_0002,2026-07-01T05:02:10.100Z,74m 40sec,FAILED,"Stage 4 failed, executor lost"
cluster-wf-syn-orders-02,_ETL_m_SYN_DM_ORDERS_SUMMARY.json,application_1774840000001_0003,2026-07-01T06:00:00.000Z,3m 12sec,,
```
`2026_07_02`: header + 1 SUCCESS row.

- [x] **Step 2: Failing test**

```java
class OperationalServiceTest {
    // build service with DataRoots whose mock composer = src/test/resources/fixture-mock/composer
    // (composer real path pointed at a nonexistent dir so the mock tier engages — reuse the Task 4 props pattern)

    @Test
    void listsDatesIsoSorted() {
        assertThat(service().dates()).containsExactly("2026-07-01", "2026-07-02");
    }
    @Test
    void snapshotParsesQuotedCommasAndNullStatus() {
        var snap = service().snapshot("2026-07-01");
        assertThat(snap.rows()).hasSize(3);
        assertThat(snap.rows().get(1).message()).isEqualTo("Stage 4 failed, executor lost");
        assertThat(snap.rows().get(2).status()).isEmpty();
    }
    @Test
    void missingDateIs404WithOperatorMessage() {
        assertThatThrownBy(() -> service().snapshot("2026-07-15"))
            .isInstanceOf(NotFoundException.class)
            .hasMessageContaining("b15 CSV not present under inputs/2026_07_15")
            .hasMessageContaining("2026-07-02");   // nearest available date included
    }
    @Test
    void malformedDateIs400() {
        assertThatThrownBy(() -> service().snapshot("bogus"))
            .isInstanceOf(InvalidDateException.class);
    }
}
```

- [x] **Step 3: Verify failure**, **Step 4: Implement** — `dates()`: scan `<composer>/dwh/config/cluster_tuning/inputs` for `\d{4}_\d{2}_\d{2}` dirs containing the b15 filename, map `_`→`-`, sort. `snapshot()`: validate with `java.time.LocalDate.parse` (catch → `InvalidDateException("Invalid date '" + input + "' — expected YYYY-MM-DD")`); resolve dir (ISO → underscores); absent ⇒ `NotFoundException("No operational snapshot for <date> — b15 CSV not present under inputs/<YYYY_MM_DD>/. Nearest available: <nearest or 'none'>")`; parse via `CsvMapper`/`CsvSchema.emptySchema().withHeader()` into `B15RowDto` (null-safe: absent cells → empty string). Composer absent entirely ⇒ `dates()` returns `[]`, `snapshot` throws the same NotFoundException with `Nearest available: none`.
- [x] **Step 5: PASS + full suite + commit**

```bash
git add backend/pom.xml backend/src/main/java/io/pure360/etl360 backend/src/test/java/io/pure360/etl360/service/OperationalServiceTest.java backend/src/test/resources/fixture-mock/composer docs/superpowers/plans/2026-07-30-synthetic-operational-data.md
git commit -m "feat(backend): OperationalService — dated b15 snapshots, operator-message 404, jackson-csv"
```

---

### Task 7: RelationshipService — nodes/edges graph (TDD)

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/api/dto/RelationshipsDto.java` (single file: `RelationshipsDto`, nested `NodeDto`, `EdgeDto`, `MetaDto`)
- Create: `backend/src/main/java/io/pure360/etl360/service/RelationshipService.java`
- Test: `backend/src/test/java/io/pure360/etl360/service/RelationshipServiceTest.java`

**Interfaces:**
- Consumes: `LayerToLayerService.entries()/skippedRows()` (Task 4), `CorpusService.allRecipePaths()` (existing).
- Produces: `RelationshipService.graph(): RelationshipsDto` —

```java
@JsonInclude(JsonInclude.Include.NON_NULL)
public record RelationshipsDto(List<NodeDto> nodes, List<EdgeDto> edges, MetaDto meta) {
    public record NodeDto(String id, String kind, String name, String layer,
                          String mappingPath, Boolean hasRecipe, String workflow,
                          Integer executionOrder, String writeMode, String partitionType) {}
    public record EdgeDto(String from, String to, String kind) {}   // kind: source|lookup|writes
    public record MetaDto(int entryCount, int skippedRows, List<String> layers) {}
}
```

Build rules: per entry → recipe node `id="recipe:"+recipe` (`layer`, `workflow`, `executionOrder`, `mappingPath` = corpus-relative path minus extension when the recipe exists in `allRecipePaths()` — derive from the recipe path's parent dir — `hasRecipe` accordingly); table node `id="table:"+NAME` for target, each source table, each lookup (`kind:"table"`, `layer` = the entry's layer for its target, sources keep the layer of the entry that WRITES them if seen, else the referencing entry's layer). Edges: source table→recipe (`source`), lookup table→recipe (`lookup`), recipe→target table (`writes`; `writeMode`/`partitionType` land on the TARGET table node from `targets_write_mode`/`target_partition` matching rows). Nodes deduped by id (first-writer wins for metadata); edges deduped exactly. `meta.layers` = distinct entry layers, sorted.

- [x] **Step 1: Failing test** — service built on the Task 4 fixture roots + real `CorpusService` over the fixture corpus; assert: node/edge counts for the 2-entry fixture, every edge endpoint exists in nodes, the recipe referencing a fixture-corpus recipe has `hasRecipe=true` + correct `mappingPath`, meta.skippedRows==1. (Fixture was extended to a 3-entry case — see note below.)
- [x] **Step 2: Verify failure → Step 3: Implement → Step 4: PASS + full suite.**
- [x] **Step 5: Commit** — `git commit -m "feat(backend): relationship graph service — tables+recipes nodes, source/lookup/writes edges"` (stage the three files + plan).

Note: the Task 4 fixture (`fixture-mock/DWH_CONTROL/LAYER_TO_LAYER/ODS/statements.sql`) had no row whose recipe matched a fixture-corpus recipe, so a third valid row (`_ETL_m_FIXTURE.json` → `TGT_FIXTURE`, matching `fixture-corpus/CDM/m_FIXTURE/_ETL_m_FIXTURE.json`) was added to exercise the `hasRecipe=true` path. `LayerToLayerServiceTest` entry-count assertions were updated from 2→3 accordingly (skipped-row count unchanged at 1).

---

### Task 8: Controllers + MockMvc slices

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/api/RelationshipController.java`, `OperationalController.java`
- Modify: `backend/src/main/java/io/pure360/etl360/api/ApiExceptionHandler.java` (add `InvalidDateException` → 400, title "Invalid date")
- Test: `backend/src/test/java/io/pure360/etl360/api/RelationshipAndOperationalControllerTest.java`

**Interfaces:**
- Produces: `GET /api/relationships` → `RelationshipsDto`; `GET /api/operational/dates` → `{"dates": [...], "mode": "real|mock|absent"}` (small inline record `OperationalDatesDto(List<String> dates, String mode)` in the controller file); `GET /api/operational/{date}` → `OperationalSnapshotDto`.

Controllers are thin pass-throughs (constructor-injected services, no logic), same shape as `TreeController`. Note: `{date}` is a single segment — plain `@PathVariable("date")`, no `{*path}` needed.

- [x] **Step 1: Failing MockMvc test** — `@SpringBootTest @AutoConfigureMockMvc` (this boots against the REAL mock data — by test time Tasks 3 exists; b15 dirs arrive in Task 9, so operational endpoints here assert only shape/error paths):
  - `/api/relationships` → 200, `$.nodes` non-empty, `$.meta.entryCount ≥ 18`, `$.meta.skippedRows == 0`.
  - `/api/operational/dates` → 200, `$.mode` in `mock|absent`, `$.dates` is an array.
  - `/api/operational/not-a-date` → 400, `$.title == "Invalid date"`, content-type `application/problem+json`.
  - `/api/operational/2001-01-01` → 404, `$.detail` contains `"b15 CSV not present under inputs/2001_01_01"`.
- [x] **Step 2: Verify failure → Step 3: Implement → Step 4: Full suite PASS.**
- [x] **Step 5: Commit** — `git commit -m "feat(backend): /api/relationships and /api/operational endpoints, Invalid date 400"` (stage the four files + plan).

---

### Task 9: b15 generator + 14-day committed history

**Files:**
- Create: `scripts/gen_b15_history.py` (executable)
- Create (generated): `backend/src/main/resources/mock/composer/dwh/config/cluster_tuning/inputs/2026_07_16/…/2026_07_29/b15_application_end_with_recipe_null_status.csv` (14 files)

**Interfaces:**
- Consumes: recipe names greppable from the eight `statements.sql` (Task 3).
- Produces: the committed history Tasks 10/12 validate. CLI: `python3 scripts/gen_b15_history.py --seed 360 --anchor 2026-07-29 --days 14 --sql-root backend/src/main/resources/mock/DWH_CONTROL/LAYER_TO_LAYER --out backend/src/main/resources/mock/composer/dwh/config/cluster_tuning/inputs` (these exact defaults baked in; run with no args = the committed artifact).

Core logic (stdlib only — write exactly this behavior):

```python
#!/usr/bin/env python3
"""Deterministic b15 operational-history generator (spec §5).
Same inputs => byte-identical output. Regenerate: python3 scripts/gen_b15_history.py
Extend the window: --anchor <later-date> [--days N] — never edit committed CSVs by hand."""
import argparse, csv, random, re, sys
from datetime import date, timedelta
from pathlib import Path

LAYERS = ["STG", "ODS", "DWH", "CDM", "RDM", "QDM", "ETL", "OUTPUT"]
FILENAME = "b15_application_end_with_recipe_null_status.csv"
COLUMNS = ["cluster_name", "recipe_filename", "job_id", "app_start_iso",
           "avg_job_duration_in_mins_sec", "status", "message"]

def recipes(sql_root: Path):
    found = []
    for layer in LAYERS:                                   # fixed order => determinism
        f = sql_root / layer / "statements.sql"
        if f.is_file():
            found += re.findall(r"'(_ETL_[A-Za-z0-9_]+\.json)'", f.read_text())
    return sorted(set(found))

def fmt_duration(seconds: int) -> str:
    return f"{seconds // 60}m {seconds % 60:02d}sec"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=360)
    ap.add_argument("--anchor", default="2026-07-29")
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--sql-root", default="backend/src/main/resources/mock/DWH_CONTROL/LAYER_TO_LAYER")
    ap.add_argument("--out", default="backend/src/main/resources/mock/composer/dwh/config/cluster_tuning/inputs")
    a = ap.parse_args()
    recs = recipes(Path(a.sql_root))
    if not recs: sys.exit("no recipes found under " + a.sql_root)
    anchor = date.fromisoformat(a.anchor)
    rng = random.Random(a.seed)
    # per-recipe stable profile drawn once, in sorted order
    profiles = {r: {"cluster": f"cluster-wf-syn-{i:02d}-{rng.randint(1000, 9999)}",
                    "base_s": rng.randint(120, 5400),
                    "fail_day": rng.randint(0, a.days - 1),
                    "null_status": (i % 7 == 3),           # every 7th-ish recipe: the b15 null-status case
                    "gap_start": rng.randint(0, a.days - 1) if i % 9 == 5 else None}
                for i, r in enumerate(recs)}
    for d in range(a.days - 1, -1, -1):
        day = anchor - timedelta(days=d)
        outdir = Path(a.out) / day.strftime("%Y_%m_%d")
        outdir.mkdir(parents=True, exist_ok=True)
        with open(outdir / FILENAME, "w", newline="") as fh:
            w = csv.writer(fh); w.writerow(COLUMNS)
            for i, r in enumerate(recs):
                p = profiles[r]
                if p["gap_start"] is not None and p["gap_start"] <= (a.days - 1 - d) < p["gap_start"] + 2:
                    continue                               # recipe disappears for two days
                seconds = p["base_s"] + rng.randint(-60, 60)
                start_h, start_m = 4 + (i % 6), rng.randint(0, 59)
                status, msg = "SUCCESS", ""
                if p["null_status"]: status = ""
                elif (a.days - 1 - d) == p["fail_day"]: status, msg = "FAILED", "Stage failure, executor lost (synthetic)"
                w.writerow([p["cluster"], r,
                            f"application_{1774840000 + a.seed}_{d:02d}{i:03d}",
                            f"{day.isoformat()}T{start_h:02d}:{start_m:02d}:00.000Z",
                            fmt_duration(max(seconds, 30)), status, msg])
    print(f"wrote {a.days} snapshots for {len(recs)} recipes under {a.out}")

if __name__ == "__main__":
    main()
```

(NOTE the rng discipline: every `rng` call happens in a deterministic sequence — profiles first in sorted-recipe order, then day-major/recipe-minor loops. Do not reorder calls; that changes the byte output.)

- [x] **Step 1: Write the script**, `chmod +x scripts/gen_b15_history.py`.
- [x] **Step 2: Generate + reproducibility proof**

```bash
python3 scripts/gen_b15_history.py
cp -R backend/src/main/resources/mock/composer /tmp/b15_first
python3 scripts/gen_b15_history.py
diff -r /tmp/b15_first backend/src/main/resources/mock/composer && echo REPRODUCIBLE
```
Expected: `REPRODUCIBLE`; 14 dirs `2026_07_16`…`2026_07_29`; spot-read one CSV (SUCCESS + FAILED + empty-status rows all present across the set).
- [x] **Step 3: Full suite** — `mvn -q -am -pl backend test` — HealthController-area tests must still pass with `composerMode` now `"mock"` (fix any assertion that pinned `"absent"`). Fixed: `ConfigControllerTest`/`HealthControllerTest` pinned `composerMode` to `{"real","absent"}`; added `"mock"` to both allowed-value lists (mode value only, mirroring the existing `dwhControlMode` list).
- [x] **Step 4: Commit**

```bash
git add scripts/gen_b15_history.py backend/src/main/resources/mock/composer docs/superpowers/plans/2026-07-30-synthetic-operational-data.md
git commit -m "feat(mock): deterministic b15 generator + 14-day committed operational history"
```

---

### Task 10: Contract tests over the real mock data

**Files:**
- Test: `backend/src/test/java/io/pure360/etl360/LayerToLayerContractTest.java`
- Test: `backend/src/test/java/io/pure360/etl360/OperationalContractTest.java`

**Interfaces:** consumes everything; this is the spec §8.1 gate.

- [x] **Step 1: Write both tests** (`@SpringBootTest @AutoConfigureMockMvc`, CorpusContractTest pattern):

`LayerToLayerContractTest`:
```java
@Test void everyConfiguredRecipeExistsInCorpus() {
    List<String> corpusRecipes = corpus.allRecipePaths().stream()
        .map(p -> p.substring(p.lastIndexOf('/') + 1)).toList();
    var entries = layerToLayer.entries();
    assertThat(entries).hasSizeGreaterThanOrEqualTo(18);
    assertThat(layerToLayer.skippedRows()).isZero();
    for (var e : entries) assertThat(corpusRecipes).contains(e.recipe());
}
@Test void synFamilyFullyConfigured() {
    assertThat(layerToLayer.entries()).extracting(LayerToLayerEntryDto::recipe)
        .contains("_ETL_m_SYN_STG_L_ORDERS_LOAD.json", "_ETL_m_SYN_STG_L_CUSTOMERS_LOAD.json",
                  "_ETL_m_SYN_ODS_ORDERS.json", "_ETL_m_SYN_ODS_CUSTOMERS.json",
                  "_ETL_m_SYN_DWH_ORDERS_FACT.json", "_ETL_m_SYN_DM_ORDERS_SUMMARY.json",
                  "_ETL_m_SYN_RDM_ORDERS_EXPORT.json", "_ETL_m_SYN_QDM_ORDERS_QUALITY.json",
                  "_ETL_m_SYN_ETL_ORDERS_BRIDGE.json", "_ETL_m_SYN_OUT_ORDERS_FEED.json");
}
@Test void decoyDirIsExcluded() {
    assertThat(layerToLayer.entries()).extracting(LayerToLayerEntryDto::recipe)
        .doesNotContain("_ETL_m_SYN_DECOY_NEVER_SERVED.json");
}
```

`OperationalContractTest`:
```java
@Test void allFourteenDatesServe() throws Exception {
    var dates = operational.dates();
    assertThat(dates).hasSize(14).startsWith("2026-07-16").endsWith("2026-07-29");
    for (String d : dates) mvc.perform(get("/api/operational/" + d)).andExpect(status().isOk())
        .andExpect(jsonPath("$.rows").isNotEmpty());
}
@Test void everyB15RecipeIsConfigured() {
    var configured = layerToLayer.entries().stream().map(LayerToLayerEntryDto::recipe).collect(java.util.stream.Collectors.toSet());
    for (String d : operational.dates())
        for (var row : operational.snapshot(d).rows()) assertThat(configured).contains(row.recipeFilename());
}
@Test void statusMixPresent() {   // SUCCESS + FAILED + null-status somewhere in the window
    var all = operational.dates().stream().flatMap(d -> operational.snapshot(d).rows().stream()).toList();
    assertThat(all).extracting(B15RowDto::status).contains("SUCCESS", "FAILED", "");
}
@Test void relationshipsGraphConsistent() throws Exception {
    mvc.perform(get("/api/relationships")).andExpect(status().isOk());
    var g = relationshipService.graph();
    var ids = g.nodes().stream().map(RelationshipsDto.NodeDto::id).collect(java.util.stream.Collectors.toSet());
    for (var e : g.edges()) { assertThat(ids).contains(e.from()); assertThat(ids).contains(e.to()); }
    assertThat(g.nodes().stream().filter(n -> n.kind().equals("recipe")).count()).isGreaterThanOrEqualTo(18);
}
```
- [x] **Step 2: Run** — `mvn -q -pl backend test -Dtest='LayerToLayerContractTest,OperationalContractTest'` — Expected: PASS immediately (integration gate, not red/green). Any failure = real data/service bug: fix the service or the mock data (generator rerun), never weaken the test.
- [x] **Step 3: Full suite + commit** — `git commit -m "test(backend): LayerToLayer + Operational contract gates over committed mock data"` (stage the two tests + plan).

---

### Task 11: Frontend hooks + OUTPUT layer color

**Files:**
- Modify: `frontend/src/api/types.gen.ts` (regenerated), `frontend/src/api/queries.ts`
- Modify: `frontend/src/components/shared/Sidebar.tsx` (ONE line: `OUTPUT` in `LAYER_COLORS`)
- Test: `frontend/src/api/operational.test.tsx`

**Interfaces:**
- Consumes: running backend (type regen), `apiGet`.
- Produces: `useRelationships()`, `useOperationalDates()`, `useOperational(date)` hooks; aliases `RelationshipGraph`, `OperationalSnapshot`, `B15Row`, `OperationalDates`.

- [x] **Step 1: Regenerate types** — boot backend (install-then-run pattern), `cd frontend && pnpm generate:api`, kill backend (verify dead). Confirm `types.gen.ts` contains `RelationshipsDto`, `OperationalSnapshotDto`, `B15RowDto`.
- [x] **Step 2: Hooks** (append to `queries.ts`, existing conventions):

```ts
export type RelationshipGraph = components['schemas']['RelationshipsDto']
export type OperationalSnapshot = components['schemas']['OperationalSnapshotDto']
export type B15Row = components['schemas']['B15RowDto']
export type OperationalDates = components['schemas']['OperationalDatesDto']

export const useRelationships = () =>
  useQuery({ queryKey: ['relationships'], queryFn: () => apiGet<RelationshipGraph>('/relationships'), staleTime: STALE_MS })

export const useOperationalDates = () =>
  useQuery({ queryKey: ['operationalDates'], queryFn: () => apiGet<OperationalDates>('/operational/dates'), staleTime: STALE_MS })

export const useOperational = (date: string) =>
  useQuery({ queryKey: ['operational', date], queryFn: () => apiGet<OperationalSnapshot>(`/operational/${date}`), staleTime: STALE_MS, enabled: !!date })
```

- [x] **Step 3: MSW test** — `operational.test.tsx` per the Task 11 (Foundation) pattern: handler for `/api/operational/dates` returning `{dates: ['2026-07-29'], mode: 'mock'}` + `/api/operational/2026-07-29` returning one row; assert `useOperationalDates` then `useOperational` resolve with the row's `recipeFilename`.
- [x] **Step 4: Sidebar color** — add `OUTPUT: '#a78bfa',` (or another EXISTING `:root` token value from `frontend/src/index.css` — verify the hex exists there first; pick the violet/purple token) to `LAYER_COLORS`. Nothing else in the file.
- [x] **Step 5: Verify** — `cd frontend && pnpm test && npx tsc --noEmit` — all green.
- [x] **Step 6: Commit** — `git commit -m "feat(frontend): relationships + operational hooks, OUTPUT layer color"` (stage `frontend` + plan).

---

### Task 12: validate-loop harness + docs

**Files:**
- Create: `scripts/validate_loop.sh` (executable)
- Modify: `Makefile` (add `validate-loop` target + `.PHONY`)
- Create: `.claude/skills/validate-loop/SKILL.md` (≤25 lines, frontmatter name+description, thin wrapper)
- Create: `docs/adr/0006-synthetic-operational-data.md` (MADR-lite, ≤30 lines: mock tiers, determinism, SYN naming, tokenizer-not-SQL-parser; consequence note updating ADR-0003's composer statement)
- Modify: `docs/architecture.md` (endpoint table + config: three new endpoints, composer mock tier), root `CLAUDE.md` (corpus counts 59→69 XMLs / 64→74 recipes where cited; one line on mock operational data + validate-loop), `README.md` (generator usage section)

**Interfaces:** consumes everything.

- [x] **Step 1: `scripts/validate_loop.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "[validate-loop] building backend…"
mvn -q -am -pl backend install -DskipTests
( cd backend && mvn -q spring-boot:run ) & BOOT=$!
trap 'kill $BOOT 2>/dev/null; wait $BOOT 2>/dev/null || true' EXIT
for i in $(seq 1 60); do curl -sf localhost:8080/api/health > /dev/null && break; sleep 1; [ "$i" = 60 ] && { echo "backend never came up"; exit 1; }; done
fail() { echo "[validate-loop] FAIL: $1"; exit 1; }
H=$(curl -sf localhost:8080/api/health) || fail "health"
# real tier wins over mock when the git-ignored real dirs exist locally — both prove the loop
echo "$H" | grep -Eq '"dwhControlMode":"(real|mock)"' || fail "dwhControlMode absent"
echo "$H" | grep -Eq '"composerMode":"(real|mock)"' || fail "composerMode absent"
curl -sf localhost:8080/api/relationships | grep -q '"nodes"' || fail "relationships"
DATES=$(curl -sf localhost:8080/api/operational/dates) || fail "dates"
echo "$DATES" | grep -q '2026-07-29' || fail "anchor date missing"
curl -sf localhost:8080/api/operational/2026-07-29 | grep -q '"rows"' || fail "snapshot"
curl -s -o /dev/null -w '%{http_code}' localhost:8080/api/operational/2001-01-01 | grep -q 404 || fail "missing-date 404"
echo "[validate-loop] backend loop OK — running frontend hook tests…"
( cd frontend && pnpm test )
echo "[validate-loop] PASS"
```
Makefile:
```makefile
validate-loop:  ## end-to-end frontend→middleware→backend gate over the mock data
	bash scripts/validate_loop.sh
```
(The `real|mock` tolerance is deliberate: on the reference machine the git-ignored real `DWH_CONTROL` dir exists, so its mode reads `"real"`; fresh checkouts read `"mock"`. Either proves the loop; only `"absent"` fails.)
- [x] **Step 2: Run `make validate-loop`** — Expected: PASS end-to-end, teardown clean (no listener on 8080 after).
- [x] **Step 3: Write ADR-0006 + doc updates** (counts sweep: CLAUDE.md testing section, architecture.md endpoint table + b15/generator paragraph, README generator usage; every quoted command must actually run).
- [x] **Step 4: `make check`** — green (docs tasks must not break it).
- [x] **Step 5: Commit** — `git commit -m "feat(harness): make validate-loop gate + ADR-0006 + docs for operational mock data"` (stage `scripts/validate_loop.sh Makefile .claude/skills docs CLAUDE.md README.md` + plan).

---

### Task 13: Acceptance sweep (spec §11)

**Files:** none new — verification + fixes only.

- [x] **Step 1: Walk the seven criteria** from spec §11, recording PASS/FAIL each (commands + outputs in the report):
1. `make test` green, floors ≥69/≥74.
2. `make validate-loop` green from the current checkout.
3. `/api/relationships` contains the full SYN chain reachable (STG→ODS→DWH→CDM→RDM/QDM + ETL/OUTPUT hops, diamond, shared lookup) — verify by walking edges from `table:SYN_FF_ORDERS`.
4. `/api/operational/2026-07-29` 200 with mixed statuses; `/api/operational/2026-07-30` 404 + operator message; dates list = 14.
5. `python3 scripts/gen_b15_history.py` rerun ⇒ `git status` clean (byte-identical).
6. Decoy exclusion test present and green.
7. Docs match reality (ADR-0006, architecture.md rows, README generator section, skills file ≤25 lines).
- [x] **Step 2: Fix anything red, re-run, commit** — `git commit --allow-empty -m "chore: sub-project 4 acceptance sweep — spec §11 criteria verified"` (message carries the record; tick this plan's last checkboxes and include it).
