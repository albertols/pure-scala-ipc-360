# ETL Operational at Scale — Implementation Plan (sub-project 10)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tab 3 usable against a real export (~7 000 recipes, ~5 000 tables) by loading only the selected clusters, and replace the duplicated, half-broken `job_id`/`app_id` links in Tabs 3 and 4 with one run picker and one link builder.

**Architecture:** Part 1 adds a cached b15 index behind three read-only endpoints and an optional `?clusters=` scope on `/api/relationships`, so the frontend can ask for a subgraph instead of the whole graph. Part 2 collapses every Google Cloud console URL into one `gcpLinks.ts` fed by served templates, and introduces a shared `RunPicker` that both tabs use to choose which execution the links point at. Part 3 rebuilds Tab 3's shell around a cluster pane, three card densities, an availability calendar, modifier-key canvas gestures, and a view-state store that survives tab switches.

**Tech Stack:** Java 17 / Spring Boot 3.3, JUnit 5 + MockMvc + AssertJ; React 19 / TypeScript / Vite, Vitest + React Testing Library + MSW; Node ≥22.6 `--experimental-strip-types` for sweeps.

**Spec:** `docs/superpowers/specs/2026-08-27-operational-scale-design.md` — section references below (`spec §5.6`) point there.

## Global Constraints

- **No new frontend runtime dependencies.** `frontend/package.json` `dependencies` stays exactly `@tanstack/react-query`, `react`, `react-dom`. The cluster list is windowed by hand; the calendar is hand-built; the store uses React 19's built-in `useSyncExternalStore`.
- **No parser changes.** No file under `parser/src/main/scala` is modified.
- **No corpus byte changes.** No `_ETL_*.json`, `.xml`/`.XML` or DDL JSON under `parser/src/main/resources/xmltobq` is edited by any task.
- **Mock data is generated, never hand-edited.** The only permitted mutation is `scripts/mock_etl_data.manifest.json` + `--emit b15` (Task 1). `scripts/gen_b15_history.py` stays **frozen**; the 18 SYN clusters are never regenerated.
- **No real customer data enters the repo.** No job id, project id, cluster name, cursor timestamp or console URL from the user's report appears in any source file, test, fixture, doc, screenshot or commit message. Console URL *shapes* live in `application.yml` as placeholder templates only. (spec §15)
- **Figma visual contract (ADR-0005):** new UI composes only existing tokens — `--bg`, `--surface`, `--surface-2`, `--surface-3`, `--border`, `--border-subtle`, `--text`, `--text-muted`, `--text-dim`, `--green`, `--red`, and the four status colours already in `OperationalCard`. No new design token. Spec §12's five sanctioned departures are the whole permitted visual surface.
- **`EtlCanvas.tsx`, `NodeBox.tsx`, `ETLViewer.tsx` and every `tab1/`/`tab2/` file are not modified**, except `App.tsx` (tab mounting, Task 11).
- **`/api/relationships` with no `clusters` parameter must stay byte-identical.** New DTO fields are `@JsonInclude(NON_NULL)`. `CorpusContractTest`, `LayerToLayerContractTest` and `scripts/relationships_sweep.mts` must pass untouched.
- **Corpus floors unchanged:** 81 XMLs, 86 recipes, 33 L2L entries. **New b15 floors from Task 1:** 21 clusters, 30 recipes, 14 dates, 417 rows.
- **`types.gen.ts` is generated**, never hand-edited. Refresh with `make generate-api` against a running backend.
- **Report backend test counts from `mvn clean test`, never a warm build** — `backend/target/surefire-reports/` accumulates reports from deleted classes. Cross-check `ls backend/target/surefire-reports/*.txt | wc -l` against `find backend/src/test/java -name '*Test.java' | wc -l`; they must match.
- **Staging discipline:** stage explicit paths. **NEVER `git add -A`** — `.claude/settings.json`, `first_prompt.md` and untracked `_layout_*.json` files are user-local.
- **Ledger:** tick this plan's checkboxes and stage the plan file in the same commit as the task's changes.

## Environment

This machine needs both prepended before any command (`docs/harness.md`, and the `etl360-dev-environment` note):

```bash
export PATH="/usr/local/bin:$HOME/.local/toolchains/node-v22.23.2-darwin-x64/bin:$PATH"
export JAVA_HOME="/Applications/IntelliJ IDEA CE.app/Contents/jbr/Contents/Home"
```

Backend focused re-run: `mvn -q -pl backend test -Dtest=ClassName` (no `-am`; needs a prior `mvn -q -am -pl backend install -DskipTests`).

## Baselines at plan authorship (2026-08-27, verified)

Backend **212** tests, 38 test classes = 38 surefire reports, 0 failures. Frontend **428** tests across 34 files, 0 failures. Committed mock b15: **30 clusters · 30 recipes · 30 (cluster,recipe) pairs · 14 dates · 417 rows** — one recipe per cluster, which is exactly what Task 1 fixes.

## File Structure

**Backend — new:**

| File | Responsibility |
|---|---|
| `service/B15Reader.java` | Locates and parses b15 CSVs. Owns `inputsDir()`, `dates()`, `csvFor(date)`, `rows(csv)` with a per-file `(mtime,size)` cache. The only code that reads a b15 file. |
| `service/ClusterIndexService.java` | The whole-history index: cluster → dates/recipes/counts, recipe → runs. Fingerprint-invalidated. No HTTP, no DTO assembly. |
| `api/ClusterController.java` | `/api/operational/clusters`, `/clusters/{name}`, `/runs`. Maps index records to DTOs; holds no logic. |
| `api/dto/ClusterIndexDto.java` | Wire shape for the index listing. |
| `api/dto/ClusterDetailDto.java` | Wire shape for one cluster's recipes. |
| `api/dto/RunsDto.java` | Wire shape for `/runs`, including `RunDto`. |

**Backend — modified:** `service/OperationalService.java` (reads through `B15Reader`), `service/RelationshipService.java` (`?clusters=` scope + neighbours), `api/RelationshipController.java`, `api/dto/RelationshipsDto.java`, `config/Etl360Properties.java` (`loggingDuration`), `api/dto/AppConfigDto.java`, `api/ConfigController.java`, `resources/application.yml`.

**Frontend — new:**

| File | Responsibility |
|---|---|
| `src/api/gcpLinks.ts` | The **only** place a Google Cloud console URL is built. Matrix-safe encoding + empty-segment collapse. |
| `src/api/clusterQueries.ts` | `useClusterIndex()`, `useClusterDetail(name)`, `useRuns(recipes, limit)` incl. the ≤200 chunking rule. |
| `src/components/shared/RunPicker.tsx` | Selectable run history: bars + selected-run field + dropdown. Used by both tabs. |
| `src/components/tab3/ClusterPane.tsx` | Left rail: search, windowed cluster list, multi-select, lazy expansion. |
| `src/components/tab3/SelectionStrip.tsx` | Chips + aggregate counts for the current selection. |
| `src/components/tab3/AvailabilityCalendar.tsx` | Month grid over available dates with four day states. |
| `src/components/tab3/OperationalProgress.tsx` | Staged loading panel (stage names + resolved totals, no percentage). |
| `src/state/operationalView.ts` | Module-level view store read via `useSyncExternalStore`. No JSX. |

**Frontend — modified:** `components/shared/OperationalCard.tsx` (density prop, `app_id` removed, contrast, `RunPicker`), `components/tab3/ETLOperational.tsx` (shell rebuild), `components/tab4/ETLDag.tsx` (RunPicker + gcpLinks), `api/dagAdapter.ts` (`fillGcpUrl` moves out, `appId` removed), `api/dagQueries.ts` (fan-out removed), `api/queries.ts`, `api/relationshipsAdapter.ts` (density-aware layout), `types.ts` (`appId` removed, `RunEntry` added), `App.tsx` (tab mounting — **Task 12**, not Task 11).

**Scripts/docs — modified:** `scripts/mock_etl_data.manifest.json`, `scripts/validate_loop.sh`, `scripts/dev.sh`, `config.example.json`, `HOW_TO_RUN_ON_YOUR_DATA.md`, `docs/architecture.md`, `docs/visual-guide.md`, `CLAUDE.md`. **New:** `docs/adr/0014-b15-cluster-index.md`, `docs/adr/0015-gcp-deep-links.md`.

---

# Part 1 — Backend

### Task 1: Multi-recipe clusters in the committed mock

**Files:**
- Modify: `scripts/mock_etl_data.manifest.json` (12 `mappings[].b15.cluster` values)
- Regenerate: `backend/src/main/resources/mock/composer/dwh/config/cluster_tuning/inputs/*/b15_application_end_with_recipe_null_status.csv` (CAS marker block only)

**Interfaces:**
- Consumes: nothing.
- Produces: the mock shape every later backend test asserts against — **21 clusters, 30 recipes, 14 dates, 417 rows**, with cluster `cluster-wf-cas-load-4001` holding **5** recipes.

**Why:** measured at plan authorship, the committed mock has 30 clusters, 30 recipes and **30 distinct (cluster, recipe) pairs** — exactly one recipe per cluster. Every feature in this sub-project groups recipes under a cluster, so without this task none of them is testable and `make validate-loop` would assert nothing about the case that matters (spec §8).

The three new cluster names deliberately **cut across** `workflow` boundaries (the CAS family has 8 workflows). That is the point: `cluster_name` (b15) and `workflow` (L2L column 4) are different facts from different sources (spec §2), and the mock must prove the code never conflates them.

- [x] **Step 1: Record the current shape, so the change is provable**

```bash
cd backend/src/main/resources/mock/composer/dwh/config/cluster_tuning/inputs
echo "clusters=$(cat */b15*.csv | grep -v '^cluster_name' | cut -d, -f1 | sort -u | wc -l)"
echo "recipes=$(cat */b15*.csv | grep -v '^cluster_name' | cut -d, -f2 | sort -u | wc -l)"
echo "pairs=$(cat */b15*.csv | grep -v '^cluster_name' | cut -d, -f1,2 | sort -u | wc -l)"
echo "rows=$(cat */b15*.csv | grep -v '^cluster_name' | wc -l)"
cd -
```

Expected: `clusters=30 recipes=30 pairs=30 rows=417` — one recipe per cluster.

- [x] **Step 2: Reassign the 12 CAS mappings to three clusters**

Edit `scripts/mock_etl_data.manifest.json`, setting each mapping's `b15.cluster` to:

| `n` | mapping | layer | workflow | new `b15.cluster` |
|---|---|---|---|---|
| 1 | `m_CAS_STG_L_EVENTS_LOAD` | STG | `wf_CAS_STG_LOAD` | `cluster-wf-cas-load-4001` |
| 2 | `m_CAS_STG_L_REFS_LOAD` | STG | `wf_CAS_STG_LOAD` | `cluster-wf-cas-load-4001` |
| 3 | `m_CAS_ODS_EVENTS` | ODS | `wf_CAS_ODS_LOAD` | `cluster-wf-cas-load-4001` |
| 4 | `m_CAS_ODS_EVENTS_ENRICH` | ODS | `wf_CAS_ODS_LOAD` | `cluster-wf-cas-load-4001` |
| 6 | `m_CAS_ODS_REFS` | ODS | `wf_CAS_ODS_LOAD` | `cluster-wf-cas-load-4001` |
| 5 | `m_CAS_DWH_EVENTS_FACT` | DWH | `wf_CAS_DWH_LOAD` | `cluster-wf-cas-core-4002` |
| 12 | `m_CAS_DWH_ORPHAN_METRICS` | DWH | `wf_CAS_DWH_LOAD` | `cluster-wf-cas-core-4002` |
| 7 | `m_CAS_ETL_EVENTS_SPLIT` | ETL | `wf_CAS_ETL_LOAD` | `cluster-wf-cas-core-4002` |
| 8 | `m_CAS_CDM_EVENTS_MART` | CDM | `wf_CAS_CDM_LOAD` | `cluster-wf-cas-core-4002` |
| 9 | `m_CAS_RDM_EVENTS_EXPORT` | RDM | `wf_CAS_RDM_LOAD` | `cluster-wf-cas-out-4003` |
| 10 | `m_CAS_QDM_EVENTS_QUALITY` | QDM | `wf_CAS_QDM_LOAD` | `cluster-wf-cas-out-4003` |
| 11 | `m_CAS_OUT_EVENTS_FEED` | OUTPUT | `wf_CAS_OUTPUT_LOAD` | `cluster-wf-cas-out-4003` |

5 / 4 / 3. Names keep the existing anonymized `cluster-wf-<family>-<slug>-<n>` shape. **Change only the `b15.cluster` string** — every other manifest field (`baseSeconds`, `spreadSeconds`, `koDates`, `koMessage`) stays exactly as-is, so durations, statuses and the incident-day cascade are unchanged and the row count cannot move.

- [x] **Step 3: Regenerate the CAS b15 block**

```bash
node --experimental-strip-types scripts/mock_etl_data.mts --emit b15
```

This strips and re-appends only the marker-delimited CAS block in each dated CSV. It is byte-idempotent; the 18 SYN clusters are untouched.

- [x] **Step 4: Verify the new shape and that nothing else moved**

```bash
cd backend/src/main/resources/mock/composer/dwh/config/cluster_tuning/inputs
echo "clusters=$(cat */b15*.csv | grep -v '^cluster_name' | cut -d, -f1 | sort -u | wc -l)"
echo "recipes=$(cat */b15*.csv | grep -v '^cluster_name' | cut -d, -f2 | sort -u | wc -l)"
echo "rows=$(cat */b15*.csv | grep -v '^cluster_name' | wc -l)"
cat */b15*.csv | grep -v '^cluster_name' | cut -d, -f1,2 | sort -u | cut -d, -f1 | uniq -c | sort -rn | head -4
cd -
```

Expected: `clusters=21 recipes=30 rows=417`, and the top of the per-cluster tally reads `5 cluster-wf-cas-load-4001`, `4 cluster-wf-cas-core-4002`, `3 cluster-wf-cas-out-4003`.

Also verify the SYN block is byte-unchanged:

```bash
git diff --stat backend/src/main/resources/mock/composer
git diff backend/src/main/resources/mock/composer | grep '^[-+]cluster-wf-syn' | head
```

Expected: only `cluster-wf-cas-*` lines appear in the diff; **zero** `cluster-wf-syn-*` lines.

- [x] **Step 5: Run the drift check and the graph sweep**

```bash
node --experimental-strip-types scripts/mock_etl_data.mts --check
mvn -q -am -pl backend install -DskipTests
mvn -q -pl backend test -Dtest=LayerToLayerContractTest,OperationalContractTest,OperationalSummaryContractTest
```

Expected: `--check` reports no drift; all three test classes pass. Cluster names appear in neither the relationships graph nor the L2L rows, so these must be unaffected.

**Do not add `-am` to a `-Dtest` run.** `-am` also builds `parser`, surefire applies the same
`-Dtest` filter there, `parser` contains none of these classes, and the reactor fails with "No tests
matching pattern ... were executed". The two-step form above is the pattern the Environment section
at the top of this plan already prescribes; every focused re-run in later tasks uses it.

- [x] **Step 6: Commit**

```bash
git add scripts/mock_etl_data.manifest.json \
        backend/src/main/resources/mock/composer \
        docs/superpowers/plans/2026-08-27-operational-scale.md
git commit -m "test(mock): group the 12 CAS recipes into 3 b15 clusters (5/4/3)

The committed mock was 1 cluster : 1 recipe (30/30/30 pairs), so no test
could exercise a cluster that groups recipes. Reassigns b15.cluster for the
CAS family only, via the manifest + --emit b15 path; the 18 SYN clusters and
the frozen gen_b15_history.py are untouched. Deliberately cuts across the 8
CAS workflows, so cluster_name and workflow can never be conflated.

New floors: 21 clusters / 30 recipes / 14 dates / 417 rows."
```

---

### Task 2: `B15Reader` — locate and parse each CSV once

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/service/B15Reader.java`
- Create: `backend/src/test/java/io/pure360/etl360/service/B15ReaderTest.java`
- Modify: `backend/src/main/java/io/pure360/etl360/service/OperationalService.java`

**Interfaces:**
- Consumes: `DataRoots.composer()`, `B15RowDto`.
- Produces, for Tasks 3–6:
  - `Optional<Path> inputsDir()`
  - `List<String> dates()` — ascending ISO `YYYY-MM-DD`
  - `Optional<Path> csvFor(String isoDate)`
  - `List<B15RowDto> rows(Path csv)` — immutable, cached on `(mtime, size)`
  - `String fingerprint()` — a stable digest of every b15 file's path/mtime/size

**Why:** `OperationalService.summary()` calls `snapshot(date)` for **every** date and `snapshot()` re-parses from disk each time (`parseCsv`, no cache), so every page load re-reads the entire b15 history. `DomService` and `SemanticModelService` both have mtime caches; this service has none (spec §1 cause 2, §5.1).

**Deliberate refinement over spec §5.1:** the spec sketches this as "extract the CSV parse". It also takes over `inputsDir()`/`dates()`/date→path resolution, because Task 3 needs exactly the same location logic and duplicating it would let the two drift. One class owns "the b15 corpus on disk"; `OperationalService` keeps snapshot/summary semantics.

- [x] **Step 1: Write the failing test**

Create `backend/src/test/java/io/pure360/etl360/service/B15ReaderTest.java`:

```java
package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.B15RowDto;
import io.pure360.etl360.config.DataRoots;
import io.pure360.etl360.config.Etl360Properties;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class B15ReaderTest {

    private static B15Reader readerOver(Path composerRoot) {
        Etl360Properties props = new Etl360Properties(
            "parser/src/main/resources/xmltobq", "does/not/exist",
            "backend/src/main/resources/mock", composerRoot.toString(), null);
        return new B15Reader(new DataRoots(props));
    }

    private static Path writeCsv(Path dir, String date, String body) throws Exception {
        Path day = Files.createDirectories(dir.resolve("dwh/config/cluster_tuning/inputs").resolve(date));
        Path csv = day.resolve("b15_application_end_with_recipe_null_status.csv");
        Files.writeString(csv, "cluster_name,recipe_filename,job_id,app_start_iso,"
            + "avg_job_duration_in_mins_sec,status,message\n" + body);
        return csv;
    }

    @Test
    void datesAreAscendingIsoAndOnlyIncludeDirsThatActuallyHoldACsv(@org.junit.jupiter.api.io.TempDir Path tmp) throws Exception {
        writeCsv(tmp, "2026_07_20", "c,r.json,j,2026-07-20T01:00:00.000Z,1m 0sec,SUCCESS,\n");
        writeCsv(tmp, "2026_07_18", "c,r.json,j,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,\n");
        Files.createDirectories(tmp.resolve("dwh/config/cluster_tuning/inputs/2026_07_19"));  // no CSV

        assertThat(readerOver(tmp).dates()).containsExactly("2026-07-18", "2026-07-20");
    }

    @Test
    void anUnchangedFileIsParsedOnceAndTheSameImmutableListIsReturned(@org.junit.jupiter.api.io.TempDir Path tmp) throws Exception {
        Path csv = writeCsv(tmp, "2026_07_18", "c1,r.json,j1,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,\n");
        B15Reader reader = readerOver(tmp);

        List<B15RowDto> first = reader.rows(csv);
        List<B15RowDto> second = reader.rows(csv);

        assertThat(first).hasSize(1);
        assertThat(second).isSameAs(first);   // cache hit, not a re-parse
    }

    @Test
    void aChangedFileIsReparsed(@org.junit.jupiter.api.io.TempDir Path tmp) throws Exception {
        Path csv = writeCsv(tmp, "2026_07_18", "c1,r.json,j1,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,\n");
        B15Reader reader = readerOver(tmp);
        List<B15RowDto> first = reader.rows(csv);

        Files.writeString(csv, Files.readString(csv)
            + "c2,r2.json,j2,2026-07-18T02:00:00.000Z,2m 0sec,FAILED,boom\n");
        Files.setLastModifiedTime(csv, java.nio.file.attribute.FileTime.fromMillis(
            Files.getLastModifiedTime(csv).toMillis() + 2000));

        List<B15RowDto> second = reader.rows(csv);
        assertThat(second).hasSize(2);
        assertThat(second.get(1).status()).isEqualTo("FAILED");
    }

    @Test
    void missingCellsNormalizeToEmptyStringNotNull(@org.junit.jupiter.api.io.TempDir Path tmp) throws Exception {
        Path csv = writeCsv(tmp, "2026_07_18", "c1,r.json,j1,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS\n");
        assertThat(readerOver(tmp).rows(csv).get(0).message()).isEmpty();
    }

    @Test
    void fingerprintChangesWhenADateDirectoryAppears(@org.junit.jupiter.api.io.TempDir Path tmp) throws Exception {
        writeCsv(tmp, "2026_07_18", "c,r.json,j,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,\n");
        B15Reader reader = readerOver(tmp);
        String before = reader.fingerprint();

        writeCsv(tmp, "2026_07_19", "c,r.json,j,2026-07-19T01:00:00.000Z,1m 0sec,SUCCESS,\n");

        assertThat(reader.fingerprint()).isNotEqualTo(before);
    }
}
```

- [x] **Step 2: Run it to verify it fails**

```bash
mvn -q -pl backend test -Dtest=B15ReaderTest
```

Expected: FAIL — `cannot find symbol: class B15Reader`.

- [x] **Step 3: Write the implementation**

Create `backend/src/main/java/io/pure360/etl360/service/B15Reader.java`:

```java
package io.pure360.etl360.service;

import com.fasterxml.jackson.databind.MappingIterator;
import com.fasterxml.jackson.dataformat.csv.CsvMapper;
import com.fasterxml.jackson.dataformat.csv.CsvSchema;
import io.pure360.etl360.api.dto.B15RowDto;
import io.pure360.etl360.config.DataRoots;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.attribute.FileTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * The b15 corpus on disk: where the dated CSVs are, which dates exist, and their parsed rows.
 *
 * <p>Parsing is cached per file on {@code (mtime, size)} — the same idiom {@link DomService} and
 * {@link SemanticModelService} use, and for the same reason: these are live working directories,
 * so a TTL would be both too eager and too lazy. Before this class, {@code
 * OperationalService.summary()} re-read every dated CSV from disk on every request.
 *
 * <p>{@link #fingerprint()} is the cheap change-detector {@link ClusterIndexService} rebuilds on:
 * a directory walk plus one stat per file, with no parsing.
 */
@Component
public class B15Reader {
    public static final String B15_FILENAME = "b15_application_end_with_recipe_null_status.csv";
    private static final Pattern DATE_DIR = Pattern.compile("\\d{4}_\\d{2}_\\d{2}");

    private record Cached(FileTime mtime, long size, List<B15RowDto> rows) {}

    private final DataRoots roots;
    private final CsvMapper csvMapper = new CsvMapper();
    private final Map<Path, Cached> cache = new ConcurrentHashMap<>();

    public B15Reader(DataRoots roots) {
        this.roots = roots;
    }

    public Optional<Path> inputsDir() {
        return roots.composer()
            .map(c -> c.resolve(DataRoots.COMPOSER_INPUTS))
            .filter(Files::isDirectory);
    }

    /** Ascending ISO dates for which a b15 CSV actually exists. An empty composer yields empty. */
    public List<String> dates() {
        List<String> out = new ArrayList<>();
        for (Path day : dayDirs()) out.add(day.getFileName().toString().replace('_', '-'));
        Collections.sort(out);
        return out;
    }

    public Optional<Path> csvFor(String isoDate) {
        return inputsDir()
            .map(dir -> dir.resolve(isoDate.replace('-', '_')).resolve(B15_FILENAME))
            .filter(Files::isRegularFile);
    }

    /** Parsed rows for one CSV, immutable and cached; re-parsed only when mtime or size changed. */
    public List<B15RowDto> rows(Path csv) {
        try {
            BasicFileAttributes attrs = Files.readAttributes(csv, BasicFileAttributes.class);
            Cached hit = cache.get(csv);
            if (hit != null && hit.mtime().equals(attrs.lastModifiedTime()) && hit.size() == attrs.size()) {
                return hit.rows();
            }
            List<B15RowDto> parsed = parse(csv);
            cache.put(csv, new Cached(attrs.lastModifiedTime(), attrs.size(), parsed));
            return parsed;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * A digest of every b15 file's path, mtime and size — stable across calls when nothing on disk
     * changed, different the moment a file or a whole date directory appears, disappears or is
     * rewritten. Parses nothing.
     */
    public String fingerprint() {
        StringBuilder sb = new StringBuilder();
        for (Path day : dayDirs()) {
            Path csv = day.resolve(B15_FILENAME);
            try {
                BasicFileAttributes a = Files.readAttributes(csv, BasicFileAttributes.class);
                sb.append(csv).append('|').append(a.lastModifiedTime().toMillis())
                  .append('|').append(a.size()).append('\n');
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
        return sb.toString();
    }

    /** Date directories holding a real CSV, sorted by directory name (== chronological). */
    private List<Path> dayDirs() {
        Optional<Path> inputs = inputsDir();
        if (inputs.isEmpty()) return List.of();
        List<Path> out = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(inputs.get())) {
            for (Path p : stream) {
                if (DATE_DIR.matcher(p.getFileName().toString()).matches()
                    && Files.isRegularFile(p.resolve(B15_FILENAME))) {
                    out.add(p);
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        out.sort(Comparator.comparing(p -> p.getFileName().toString()));
        return out;
    }

    private List<B15RowDto> parse(Path csv) {
        try {
            CsvSchema schema = CsvSchema.emptySchema().withHeader();
            MappingIterator<Map<String, String>> it =
                csvMapper.readerFor(Map.class).with(schema).readValues(csv.toFile());
            List<B15RowDto> out = new ArrayList<>();
            for (Map<String, String> row : it.readAll()) {
                out.add(new B15RowDto(
                    cell(row, "cluster_name"), cell(row, "recipe_filename"), cell(row, "job_id"),
                    cell(row, "app_start_iso"), cell(row, "avg_job_duration_in_mins_sec"),
                    cell(row, "status"), cell(row, "message")));
            }
            return List.copyOf(out);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Missing/absent cells (short rows without trailing commas) map to null in the CsvMapper
     * result; normalize those — and any nulls — to empty string, matching present-but-empty cells. */
    private static String cell(Map<String, String> row, String key) {
        String v = row.get(key);
        return v == null ? "" : v;
    }
}
```

Add `import java.util.Comparator;` to the import block.

- [x] **Step 4: Run the test to verify it passes**

```bash
mvn -q -pl backend test -Dtest=B15ReaderTest
```

Expected: PASS, 5 tests.

- [x] **Step 5: Move `OperationalService` onto the reader**

In `OperationalService.java`: inject `B15Reader b15` alongside the existing `DataRoots roots` and `LayerToLayerService layerToLayer`, then

- delete the `B15_FILENAME`, `DATE_DIR` constants, the `csvMapper` field, and the `parseCsv`/`cell`/`inputsDir` methods;
- `dates()` becomes `return b15.dates();`
- in `snapshot(String isoDate)`, keep the `LocalDate.parse` validation and the `NotFoundException` message verbatim (including `"Nearest available: " + nearestAvailable(date)`), but resolve the file with `b15.csvFor(isoDate)` and read rows with `b15.rows(csv)`.

Keep `parseDurationMin`, `nearestRank`, `nearestAvailable` and the whole of `summary()` unchanged — behaviour must not move, only the I/O path.

- [x] **Step 6: Run the full backend suite to prove nothing moved**

```bash
mvn -q -am -pl backend clean test
grep -h "^Tests run:" backend/target/surefire-reports/*.txt \
  | awk -F'[ ,]+' '{t+=$3; f+=$5; e+=$7} END {print "tests="t, "failures="f, "errors="e}'
```

Expected: `failures=0 errors=0`, total **217** (212 baseline + 5 new).

- [x] **Step 7: Commit**

```bash
git add backend/src/main/java/io/pure360/etl360/service/B15Reader.java \
        backend/src/test/java/io/pure360/etl360/service/B15ReaderTest.java \
        backend/src/main/java/io/pure360/etl360/service/OperationalService.java \
        docs/superpowers/plans/2026-08-27-operational-scale.md
git commit -m "perf(operational): cache b15 parsing per file in a new B15Reader

OperationalService.summary() walked every date and re-parsed each CSV from
disk on every request. B15Reader owns b15 location + parsing with the same
(mtime,size) cache idiom DomService and SemanticModelService already use, and
exposes fingerprint() for the cluster index to rebuild on. Snapshot and
summary semantics are unchanged — only the I/O path moves."
```

---

### Task 3: `ClusterIndexService` — the whole-history b15 index

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/service/ClusterIndexService.java`
- Create: `backend/src/test/java/io/pure360/etl360/service/ClusterIndexServiceTest.java`

**Interfaces:**
- Consumes: `B15Reader.dates()`, `.csvFor()`, `.rows()`, `.fingerprint()` (Task 2).
- Produces, for Tasks 4–6:
  - `record RunEntry(String date, String clusterName, String recipeFilename, String jobId, String appStartIso, Double durationMin, String status, String message)`
  - `record ClusterEntry(String name, List<Integer> dateIdx, List<String> recipes, int rows, int ok, int ko, String lastDate, String lastStatus)`
  - `record Totals(int clusters, int recipes, int dates, int rows)`
  - `record Index(List<String> dates, Map<String, ClusterEntry> byCluster, Map<String, List<RunEntry>> runsByRecipe, Totals totals)`
  - `Index index()` — cached, fingerprint-invalidated
  - `Set<String> recipesIn(Collection<String> clusterNames)`
  - `List<String> clustersOf(String recipeFilename)`

**Why:** the cluster pane, the calendar, the run picker and the scoped graph all need the same three joins (cluster→recipes, cluster→dates, recipe→runs), and computing any of them per request means re-walking the whole history (spec §5.2).

**Deliberate scope boundary:** this service resolves **no layers**. `layer` is an L2L fact, not a b15 one; resolving it here would drag `LayerToLayerService` into a class that is otherwise a pure function of the b15 files, and make it untestable without the control schema. Task 4's controller joins the layer in.

- [x] **Step 1: Write the failing test**

Create `backend/src/test/java/io/pure360/etl360/service/ClusterIndexServiceTest.java`:

```java
package io.pure360.etl360.service;

import io.pure360.etl360.config.DataRoots;
import io.pure360.etl360.config.Etl360Properties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class ClusterIndexServiceTest {

    private static final String HEADER = "cluster_name,recipe_filename,job_id,app_start_iso,"
        + "avg_job_duration_in_mins_sec,status,message\n";

    private static ClusterIndexService serviceOver(Path composerRoot) {
        Etl360Properties props = new Etl360Properties(
            "parser/src/main/resources/xmltobq", "does/not/exist",
            "backend/src/main/resources/mock", composerRoot.toString(), null);
        return new ClusterIndexService(new B15Reader(new DataRoots(props)));
    }

    private static void day(Path root, String date, String... rows) throws Exception {
        Path dir = Files.createDirectories(root.resolve("dwh/config/cluster_tuning/inputs").resolve(date));
        Files.writeString(dir.resolve(B15Reader.B15_FILENAME), HEADER + String.join("\n", rows) + "\n");
    }

    @Test
    void groupsRecipesUnderTheirClusterAndCountsOkKo(@TempDir Path tmp) throws Exception {
        day(tmp, "2026_07_18",
            "cl-a,r1.json,j1,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,",
            "cl-a,r2.json,j2,2026-07-18T02:00:00.000Z,2m 0sec,FAILED,boom",
            "cl-b,r3.json,j3,2026-07-18T03:00:00.000Z,3m 0sec,SUCCESS,");

        var index = serviceOver(tmp).index();

        assertThat(index.byCluster()).containsOnlyKeys("cl-a", "cl-b");
        assertThat(index.byCluster().get("cl-a").recipes()).containsExactly("r1.json", "r2.json");
        assertThat(index.byCluster().get("cl-a").rows()).isEqualTo(2);
        assertThat(index.byCluster().get("cl-a").ok()).isEqualTo(1);
        assertThat(index.byCluster().get("cl-a").ko()).isEqualTo(1);
        assertThat(index.totals().clusters()).isEqualTo(2);
        assertThat(index.totals().recipes()).isEqualTo(3);
        assertThat(index.totals().rows()).isEqualTo(3);
    }

    @Test
    void dateIdxIndexesTheGlobalDateAxisRatherThanRepeatingIsoStrings(@TempDir Path tmp) throws Exception {
        day(tmp, "2026_07_18", "cl-a,r1.json,j1,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,");
        day(tmp, "2026_07_19", "cl-b,r2.json,j2,2026-07-19T01:00:00.000Z,1m 0sec,SUCCESS,");
        day(tmp, "2026_07_20", "cl-a,r1.json,j3,2026-07-20T01:00:00.000Z,1m 0sec,SUCCESS,");

        var index = serviceOver(tmp).index();

        assertThat(index.dates()).containsExactly("2026-07-18", "2026-07-19", "2026-07-20");
        assertThat(index.byCluster().get("cl-a").dateIdx()).containsExactly(0, 2);
        assertThat(index.byCluster().get("cl-b").dateIdx()).containsExactly(1);
    }

    @Test
    void runsForARecipeAreDateAscendingAndCarryJobIdAndStartTimestamp(@TempDir Path tmp) throws Exception {
        day(tmp, "2026_07_19", "cl-a,r1.json,j-19,2026-07-19T05:00:00.000Z,1m 30sec,SUCCESS,");
        day(tmp, "2026_07_18", "cl-a,r1.json,j-18,2026-07-18T04:00:00.000Z,2m 0sec,FAILED,boom");

        var runs = serviceOver(tmp).index().runsByRecipe().get("r1.json");

        assertThat(runs).hasSize(2);
        assertThat(runs.get(0).date()).isEqualTo("2026-07-18");
        assertThat(runs.get(0).jobId()).isEqualTo("j-18");
        assertThat(runs.get(0).status()).isEqualTo("FAILED");
        assertThat(runs.get(0).message()).isEqualTo("boom");
        assertThat(runs.get(1).appStartIso()).isEqualTo("2026-07-19T05:00:00.000Z");
        assertThat(runs.get(1).durationMin()).isEqualTo(1.5);
    }

    @Test
    void lastDateAndLastStatusComeFromTheMostRecentDate(@TempDir Path tmp) throws Exception {
        day(tmp, "2026_07_18", "cl-a,r1.json,j1,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,");
        day(tmp, "2026_07_19", "cl-a,r1.json,j2,2026-07-19T01:00:00.000Z,1m 0sec,FAILED,boom");

        var entry = serviceOver(tmp).index().byCluster().get("cl-a");

        assertThat(entry.lastDate()).isEqualTo("2026-07-19");
        assertThat(entry.lastStatus()).isEqualTo("FAILED");
    }

    @Test
    void anUnrecognizedStatusCountsAsNeitherOkNorKo(@TempDir Path tmp) throws Exception {
        day(tmp, "2026_07_18",
            "cl-a,r1.json,j1,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,",
            "cl-a,r2.json,j2,2026-07-18T02:00:00.000Z,,,");

        var entry = serviceOver(tmp).index().byCluster().get("cl-a");

        assertThat(entry.rows()).isEqualTo(2);
        assertThat(entry.ok()).isEqualTo(1);
        assertThat(entry.ko()).isZero();
    }

    @Test
    void theIndexIsCachedAndRebuiltWhenANewDateDirectoryAppears(@TempDir Path tmp) throws Exception {
        day(tmp, "2026_07_18", "cl-a,r1.json,j1,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,");
        ClusterIndexService service = serviceOver(tmp);

        var first = service.index();
        assertThat(service.index()).isSameAs(first);          // unchanged disk -> cache hit

        day(tmp, "2026_07_19", "cl-b,r2.json,j2,2026-07-19T01:00:00.000Z,1m 0sec,SUCCESS,");

        var second = service.index();
        assertThat(second).isNotSameAs(first);
        assertThat(second.totals().clusters()).isEqualTo(2);
    }

    @Test
    void recipesInAndClustersOfAreTheTwoJoinDirections(@TempDir Path tmp) throws Exception {
        day(tmp, "2026_07_18",
            "cl-a,r1.json,j1,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,",
            "cl-a,r2.json,j2,2026-07-18T02:00:00.000Z,1m 0sec,SUCCESS,",
            "cl-b,r3.json,j3,2026-07-18T03:00:00.000Z,1m 0sec,SUCCESS,");
        ClusterIndexService service = serviceOver(tmp);

        assertThat(service.recipesIn(java.util.List.of("cl-a"))).containsExactlyInAnyOrder("r1.json", "r2.json");
        assertThat(service.recipesIn(java.util.List.of("cl-a", "cl-b"))).hasSize(3);
        assertThat(service.recipesIn(java.util.List.of("nope"))).isEmpty();
        assertThat(service.clustersOf("r3.json")).containsExactly("cl-b");
        assertThat(service.clustersOf("unknown.json")).isEmpty();
    }

    @Test
    void anAbsentComposerYieldsAnEmptyIndexRatherThanThrowing(@TempDir Path tmp) {
        var index = serviceOver(tmp.resolve("nothing-here")).index();

        assertThat(index.dates()).isEmpty();
        assertThat(index.byCluster()).isEmpty();
        assertThat(index.totals().rows()).isZero();
    }
}
```

- [x] **Step 2: Run it to verify it fails**

```bash
mvn -q -pl backend test -Dtest=ClusterIndexServiceTest
```

Expected: FAIL — `cannot find symbol: class ClusterIndexService`.

- [x] **Step 3: Write the implementation**

Create `backend/src/main/java/io/pure360/etl360/service/ClusterIndexService.java`:

```java
package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.B15RowDto;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Indexes the whole committed b15 history once, so the cluster pane, the calendar, the run picker
 * and the scoped relationships graph share one walk instead of four.
 *
 * <p>Cached whole and invalidated by {@link B15Reader#fingerprint()} rather than a TTL: a new dated
 * export appears without a restart, and an unchanged directory costs one stat per file. Building it
 * is O(total rows) and happens on the first request after any change.
 *
 * <p>Resolves <b>no layers</b>. A recipe's layer is an L2L fact; joining it here would couple a pure
 * function of the b15 files to the control schema. {@code ClusterController} performs that join.
 */
@Service
public class ClusterIndexService {

    /** One b15 row, resolved. {@code durationMin} is null when the duration cell is unparseable. */
    public record RunEntry(String date, String clusterName, String recipeFilename, String jobId,
                           String appStartIso, Double durationMin, String status, String message) {}

    /** {@code dateIdx} indexes {@link Index#dates()}; {@code recipes} is name-ascending. */
    public record ClusterEntry(String name, List<Integer> dateIdx, List<String> recipes,
                               int rows, int ok, int ko, String lastDate, String lastStatus) {}

    /** No table count: b15 knows nothing about tables, and inventing one here would be a lie. */
    public record Totals(int clusters, int recipes, int dates, int rows) {}

    public record Index(List<String> dates, Map<String, ClusterEntry> byCluster,
                        Map<String, List<RunEntry>> runsByRecipe, Totals totals) {}

    private static final String OK = "SUCCESS";
    private static final String KO = "FAILED";

    private final B15Reader b15;
    private volatile String fingerprint;
    private volatile Index cached;

    public ClusterIndexService(B15Reader b15) {
        this.b15 = b15;
    }

    public Index index() {
        String fp = b15.fingerprint();
        Index hit = cached;
        if (hit != null && fp.equals(fingerprint)) return hit;
        synchronized (this) {
            if (cached != null && fp.equals(fingerprint)) return cached;
            Index built = build();
            cached = built;
            fingerprint = fp;
            return built;
        }
    }

    /** Every recipe filename that ran in any of {@code clusterNames}. Unknown names contribute none. */
    public Set<String> recipesIn(Collection<String> clusterNames) {
        Map<String, ClusterEntry> byCluster = index().byCluster();
        Set<String> out = new LinkedHashSet<>();
        for (String name : clusterNames) {
            ClusterEntry entry = byCluster.get(name);
            if (entry != null) out.addAll(entry.recipes());
        }
        return out;
    }

    /** The clusters a recipe has run in, name-ascending. Empty for a recipe absent from b15. */
    public List<String> clustersOf(String recipeFilename) {
        List<String> out = new ArrayList<>();
        for (ClusterEntry entry : index().byCluster().values()) {
            if (entry.recipes().contains(recipeFilename)) out.add(entry.name());
        }
        return List.copyOf(out);
    }

    private Index build() {
        List<String> dates = b15.dates();

        // Accumulators. TreeMap so clusters come out name-ascending deterministically, matching
        // OperationalService.summary()'s sorted-recipes contract.
        Map<String, Set<Integer>> dateIdxByCluster = new TreeMap<>();
        Map<String, Set<String>> recipesByCluster = new TreeMap<>();
        Map<String, int[]> countsByCluster = new TreeMap<>();          // [rows, ok, ko]
        Map<String, String> lastDateByCluster = new TreeMap<>();
        Map<String, String> lastStatusByCluster = new TreeMap<>();
        Map<String, List<RunEntry>> runsByRecipe = new LinkedHashMap<>();
        Set<String> allRecipes = new LinkedHashSet<>();
        int rowTotal = 0;

        for (int i = 0; i < dates.size(); i++) {
            String date = dates.get(i);
            Path csv = b15.csvFor(date).orElse(null);
            if (csv == null) continue;                                  // raced away since dates()
            for (B15RowDto row : b15.rows(csv)) {
                rowTotal++;
                String cluster = row.clusterName();
                String recipe = row.recipeFilename();
                allRecipes.add(recipe);

                dateIdxByCluster.computeIfAbsent(cluster, k -> new LinkedHashSet<>()).add(i);
                recipesByCluster.computeIfAbsent(cluster, k -> new java.util.TreeSet<>()).add(recipe);
                int[] counts = countsByCluster.computeIfAbsent(cluster, k -> new int[3]);
                counts[0]++;
                if (OK.equals(row.status())) counts[1]++;
                else if (KO.equals(row.status())) counts[2]++;
                // dates ascending -> last write wins == the most recent date the cluster ran
                lastDateByCluster.put(cluster, date);
                lastStatusByCluster.put(cluster, row.status());

                runsByRecipe.computeIfAbsent(recipe, k -> new ArrayList<>()).add(new RunEntry(
                    date, cluster, recipe, row.jobId(), row.appStartIso(),
                    OperationalService.parseDurationMin(row.avgJobDurationInMinsSec()),
                    row.status(), row.message()));
            }
        }

        Map<String, ClusterEntry> byCluster = new LinkedHashMap<>();
        for (String cluster : recipesByCluster.keySet()) {
            int[] counts = countsByCluster.get(cluster);
            byCluster.put(cluster, new ClusterEntry(
                cluster,
                List.copyOf(dateIdxByCluster.get(cluster)),
                List.copyOf(recipesByCluster.get(cluster)),
                counts[0], counts[1], counts[2],
                lastDateByCluster.get(cluster), lastStatusByCluster.get(cluster)));
        }

        Map<String, List<RunEntry>> runs = new LinkedHashMap<>();
        runsByRecipe.forEach((recipe, list) -> runs.put(recipe, List.copyOf(list)));

        return new Index(dates, Map.copyOf(byCluster), Map.copyOf(runs),
            new Totals(byCluster.size(), allRecipes.size(), dates.size(), rowTotal));
    }
}
```

`OperationalService.parseDurationMin` is already package-private static in the same package — reuse it rather than writing a second duration parser.

**Note on `Map.copyOf`:** it does not preserve iteration order. `byCluster` is consumed by key lookup and by Task 4's controller, which sorts explicitly before serializing — so ordering is asserted at the wire, not relied upon here.

- [x] **Step 4: Run the test to verify it passes**

```bash
mvn -q -pl backend test -Dtest=ClusterIndexServiceTest
```

Expected: PASS, 8 tests.

- [x] **Step 5: Commit**

```bash
git add backend/src/main/java/io/pure360/etl360/service/ClusterIndexService.java \
        backend/src/test/java/io/pure360/etl360/service/ClusterIndexServiceTest.java \
        docs/superpowers/plans/2026-08-27-operational-scale.md
git commit -m "feat(operational): index the b15 history by cluster and by recipe

One fingerprint-invalidated walk backs the cluster pane, the calendar, the run
picker and the scoped graph. Per-cluster dates are indices into a single global
date axis, not repeated ISO strings — at ~1300 clusters x ~90 days that is the
difference between a compact payload and ~115k duplicated strings.

Resolves no layers by design: that is an L2L fact, joined at the controller."
```

---

### Task 4: `GET /api/operational/clusters` and `/clusters/{name}`

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/api/ClusterController.java`
- Create: `backend/src/main/java/io/pure360/etl360/api/dto/ClusterIndexDto.java`
- Create: `backend/src/main/java/io/pure360/etl360/api/dto/ClusterDetailDto.java`
- Create: `backend/src/test/java/io/pure360/etl360/ClusterEndpointsContractTest.java`

**Interfaces:**
- Consumes: `ClusterIndexService.index()`, `LayerToLayerService.entries()`, `DataRoots.composerMode()`.
- Produces: the two wire shapes Task 12/13 consume, and the `/runs` route added in Task 5 (same controller).

**Route-precedence hazard:** `OperationalController` already maps `@GetMapping("/{date}")` under `/api/operational`. A literal `/clusters` segment wins over the `{date}` template in Spring's path matching — `/dates` and `/summary` already prove that precedence in the same namespace. The first test below asserts it explicitly, so a future mapping change cannot silently route `/clusters` into the snapshot handler and produce an "Invalid date 'clusters'" 400.

- [x] **Step 1: Write the failing test**

Create `backend/src/test/java/io/pure360/etl360/ClusterEndpointsContractTest.java`:

```java
package io.pure360.etl360;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Contract for the b15 cluster index against the committed mock tier — 21 clusters / 30 recipes /
 * 14 dates / 417 rows, with cluster-wf-cas-load-4001 holding 5 recipes (Task 1). These are the
 * floors `make validate-loop` re-asserts over HTTP.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ClusterEndpointsContractTest {
    @Autowired MockMvc mvc;

    /** A literal /clusters must not be swallowed by OperationalController's /{date} template. */
    @Test
    void clustersIsRoutedAsALiteralSegmentNotAsADate() throws Exception {
        mvc.perform(get("/api/operational/clusters"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.totals").value(notNullValue()));
    }

    @Test
    void theIndexReportsTheCommittedMockFloors() throws Exception {
        mvc.perform(get("/api/operational/clusters"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.totals.clusters").value(21))
           .andExpect(jsonPath("$.totals.recipes").value(30))
           .andExpect(jsonPath("$.totals.dates").value(14))
           .andExpect(jsonPath("$.totals.rows").value(417))
           .andExpect(jsonPath("$.dates", hasSize(14)))
           .andExpect(jsonPath("$.clusters", hasSize(21)))
           .andExpect(jsonPath("$.mode").value("mock"));
    }

    /** The whole point of Task 1: a cluster that groups several recipes actually exists. */
    @Test
    void atLeastOneClusterGroupsFourOrMoreRecipes() throws Exception {
        mvc.perform(get("/api/operational/clusters"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.clusters[?(@.name == 'cluster-wf-cas-load-4001')].recipeCount").value(5))
           .andExpect(jsonPath("$.clusters[?(@.name == 'cluster-wf-cas-core-4002')].recipeCount").value(4));
    }

    @Test
    void clustersAreNameAscendingAndCarryDateIndicesNotIsoStrings() throws Exception {
        mvc.perform(get("/api/operational/clusters"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.clusters[0].name").value("cluster-wf-cas-core-4002"))
           .andExpect(jsonPath("$.clusters[0].dateIdx", everyItem(greaterThanOrEqualTo(0))))
           .andExpect(jsonPath("$.clusters[0].lastDate").value(notNullValue()));
    }

    @Test
    void theDetailEndpointListsTheClustersRecipesWithTheirLayer() throws Exception {
        mvc.perform(get("/api/operational/clusters/cluster-wf-cas-load-4001"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.name").value("cluster-wf-cas-load-4001"))
           .andExpect(jsonPath("$.recipes", hasSize(5)))
           .andExpect(jsonPath("$.recipes[0].recipeFilename").value(notNullValue()))
           .andExpect(jsonPath("$.recipes[0].layer").value(notNullValue()))
           .andExpect(jsonPath("$.recipes[0].dateIdx").value(notNullValue()));
    }

    /** The CAS clusters deliberately cut across workflows — proves layer comes from L2L, per recipe. */
    @Test
    void recipesInOneClusterCanCarryDifferentLayers() throws Exception {
        mvc.perform(get("/api/operational/clusters/cluster-wf-cas-load-4001"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.recipes[?(@.layer == 'STG')]", hasSize(2)))
           .andExpect(jsonPath("$.recipes[?(@.layer == 'ODS')]", hasSize(3)));
    }

    @Test
    void anUnknownClusterIs404() throws Exception {
        mvc.perform(get("/api/operational/clusters/no-such-cluster"))
           .andExpect(status().isNotFound());
    }
}
```

- [x] **Step 2: Run it to verify it fails**

```bash
mvn -q -pl backend test -Dtest=ClusterEndpointsContractTest
```

Expected: FAIL — 404 on `/api/operational/clusters` (no handler yet).

- [x] **Step 3: Write the DTOs**

Create `backend/src/main/java/io/pure360/etl360/api/dto/ClusterIndexDto.java`:

```java
package io.pure360.etl360.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/**
 * The cluster pane's only startup payload. Per-cluster dates are indices into {@link #dates()}
 * rather than repeated ISO strings — see ClusterIndexService for the sizing rationale. Carries no
 * table count: b15 has no notion of tables.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ClusterIndexDto(String mode, List<String> dates, TotalsDto totals,
                              List<ClusterSummaryDto> clusters) {

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record TotalsDto(int clusters, int recipes, int dates, int rows) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ClusterSummaryDto(String name, int recipeCount, List<Integer> dateIdx,
                                    int rows, int ok, int ko, String lastDate, String lastStatus) {}
}
```

Create `backend/src/main/java/io/pure360/etl360/api/dto/ClusterDetailDto.java`:

```java
package io.pure360.etl360.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/** One cluster's recipes, fetched lazily when a pane row is expanded. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ClusterDetailDto(String name, List<String> dates, List<RecipeInClusterDto> recipes) {

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RecipeInClusterDto(String recipeFilename, String layer, List<Integer> dateIdx,
                                     int rows, int ok, int ko, String lastDate, String lastStatus) {}
}
```

- [x] **Step 4: Write the controller**

Create `backend/src/main/java/io/pure360/etl360/api/ClusterController.java`:

```java
package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.ClusterDetailDto;
import io.pure360.etl360.api.dto.ClusterIndexDto;
import io.pure360.etl360.api.dto.LayerToLayerEntryDto;
import io.pure360.etl360.config.DataRoots;
import io.pure360.etl360.service.ClusterIndexService;
import io.pure360.etl360.service.LayerToLayerService;
import io.pure360.etl360.service.support.NotFoundException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Serves the b15 cluster index. Holds no logic beyond DTO assembly and the one join
 * {@link ClusterIndexService} deliberately does not do: recipe -> layer, resolved from
 * {@link LayerToLayerService} with the same first-match-wins rule and "UNKNOWN" fallback
 * {@code OperationalService.summary()} uses.
 */
@RestController
@RequestMapping("/api/operational")
public class ClusterController {
    private static final String UNKNOWN_LAYER = "UNKNOWN";

    private final ClusterIndexService index;
    private final LayerToLayerService layerToLayer;
    private final DataRoots roots;

    public ClusterController(ClusterIndexService index, LayerToLayerService layerToLayer, DataRoots roots) {
        this.index = index;
        this.layerToLayer = layerToLayer;
        this.roots = roots;
    }

    @GetMapping("/clusters")
    public ClusterIndexDto clusters() {
        ClusterIndexService.Index idx = index.index();
        List<ClusterIndexDto.ClusterSummaryDto> clusters = idx.byCluster().values().stream()
            .sorted(Comparator.comparing(ClusterIndexService.ClusterEntry::name))
            .map(e -> new ClusterIndexDto.ClusterSummaryDto(e.name(), e.recipes().size(), e.dateIdx(),
                e.rows(), e.ok(), e.ko(), e.lastDate(), e.lastStatus()))
            .toList();
        ClusterIndexService.Totals t = idx.totals();
        return new ClusterIndexDto(roots.composerMode(), idx.dates(),
            new ClusterIndexDto.TotalsDto(t.clusters(), t.recipes(), t.dates(), t.rows()), clusters);
    }

    @GetMapping("/clusters/{name}")
    public ClusterDetailDto cluster(@PathVariable("name") String name) {
        ClusterIndexService.Index idx = index.index();
        ClusterIndexService.ClusterEntry entry = idx.byCluster().get(name);
        if (entry == null) throw new NotFoundException("No cluster '" + name + "' in the b15 history");

        Map<String, String> layerByRecipe = layerByRecipe();
        List<String> dates = entry.dateIdx().stream().map(idx.dates()::get).toList();

        List<ClusterDetailDto.RecipeInClusterDto> recipes = new ArrayList<>();
        for (String recipe : entry.recipes()) {
            List<ClusterIndexService.RunEntry> runs = idx.runsByRecipe().getOrDefault(recipe, List.of());
            List<Integer> dateIdx = runs.stream()
                .filter(r -> name.equals(r.clusterName()))
                .map(r -> idx.dates().indexOf(r.date()))
                .distinct().sorted().toList();
            int ok = 0, ko = 0;
            String lastDate = null, lastStatus = null;
            for (ClusterIndexService.RunEntry r : runs) {
                if (!name.equals(r.clusterName())) continue;
                if ("SUCCESS".equals(r.status())) ok++;
                else if ("FAILED".equals(r.status())) ko++;
                lastDate = r.date();               // runs are date-ascending
                lastStatus = r.status();
            }
            recipes.add(new ClusterDetailDto.RecipeInClusterDto(recipe,
                layerByRecipe.getOrDefault(recipe, UNKNOWN_LAYER), dateIdx,
                dateIdx.size(), ok, ko, lastDate, lastStatus));
        }
        return new ClusterDetailDto(name, dates, recipes);
    }

    private Map<String, String> layerByRecipe() {
        Map<String, String> out = new LinkedHashMap<>();
        for (LayerToLayerEntryDto entry : layerToLayer.entries()) {
            out.putIfAbsent(entry.recipe(), entry.layer());   // first match wins
        }
        return out;
    }
}
```

- [x] **Step 5: Run the test to verify it passes**

```bash
mvn -q -pl backend test -Dtest=ClusterEndpointsContractTest
```

Expected: PASS, 7 tests.

- [x] **Step 6: Commit**

```bash
git add backend/src/main/java/io/pure360/etl360/api/ClusterController.java \
        backend/src/main/java/io/pure360/etl360/api/dto/ClusterIndexDto.java \
        backend/src/main/java/io/pure360/etl360/api/dto/ClusterDetailDto.java \
        backend/src/test/java/io/pure360/etl360/ClusterEndpointsContractTest.java \
        docs/superpowers/plans/2026-08-27-operational-scale.md
git commit -m "feat(api): GET /api/operational/clusters and /clusters/{name}

The cluster pane's startup payload (totals, global date axis, per-cluster
counts) and the lazy per-cluster recipe list. Layer is joined here from L2L,
first-match-wins with an UNKNOWN fallback, matching summary()'s rule.

Asserts the committed-mock floors 21/30/14/417 and that /clusters routes as a
literal segment rather than into OperationalController's /{date} template."
```

---

### Task 5: `GET /api/operational/runs`

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/api/dto/RunsDto.java`
- Modify: `backend/src/main/java/io/pure360/etl360/api/ClusterController.java`
- Modify: `backend/src/test/java/io/pure360/etl360/ClusterEndpointsContractTest.java`

**Interfaces:**
- Consumes: `ClusterIndexService.Index.runsByRecipe()`.
- Produces, for Tasks 8–10: `RunsDto(int limit, Map<String, List<RunDto>> byRecipe)` where
  `RunDto(String date, String clusterName, String jobId, String appStartIso, Double durationMin, String status, String message)`, **newest-first**, requested-but-absent recipes mapping to `[]`.

**Why:** this is the single source of run history for both tabs. It replaces Tab 4's `useOperationalSnapshots(dates)`, which issues one `/operational/{date}` request per available date and holds every row of every day in memory purely to draw a history strip (spec §1 cause 3).

**Bound:** at most `MAX_RECIPES = 200` recipes per request, `limit` default 10 (the user's ask) and max 50. Task 8's hook chunks client-side so the bound never reaches a user as a 400.

- [x] **Step 1: Write the failing tests**

Append to `ClusterEndpointsContractTest.java` (add `import static org.hamcrest.Matchers.empty;` and `import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;` is already present):

```java
    @Test
    void runsAreNewestFirstAndCarryTheJobIdAndStartTimestampTheLinksNeed() throws Exception {
        mvc.perform(get("/api/operational/runs")
                .param("recipe", "_ETL_m_CAS_DWH_EVENTS_FACT.json"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.limit").value(10))
           .andExpect(jsonPath("$.byRecipe['_ETL_m_CAS_DWH_EVENTS_FACT.json']", hasSize(10)))
           .andExpect(jsonPath("$.byRecipe['_ETL_m_CAS_DWH_EVENTS_FACT.json'][0].date").value("2026-07-29"))
           .andExpect(jsonPath("$.byRecipe['_ETL_m_CAS_DWH_EVENTS_FACT.json'][0].jobId").value(notNullValue()))
           .andExpect(jsonPath("$.byRecipe['_ETL_m_CAS_DWH_EVENTS_FACT.json'][0].appStartIso").value(notNullValue()))
           .andExpect(jsonPath("$.byRecipe['_ETL_m_CAS_DWH_EVENTS_FACT.json'][0].clusterName").value("cluster-wf-cas-core-4002"));
    }

    @Test
    void limitDefaultsToTenAndIsHonoured() throws Exception {
        mvc.perform(get("/api/operational/runs")
                .param("recipe", "_ETL_m_CAS_DWH_EVENTS_FACT.json").param("limit", "3"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.limit").value(3))
           .andExpect(jsonPath("$.byRecipe['_ETL_m_CAS_DWH_EVENTS_FACT.json']", hasSize(3)));
    }

    @Test
    void severalRecipesComeBackInOneCall() throws Exception {
        mvc.perform(get("/api/operational/runs")
                .param("recipe", "_ETL_m_CAS_DWH_EVENTS_FACT.json")
                .param("recipe", "_ETL_m_CAS_ODS_EVENTS.json"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.byRecipe['_ETL_m_CAS_DWH_EVENTS_FACT.json']", hasSize(10)))
           .andExpect(jsonPath("$.byRecipe['_ETL_m_CAS_ODS_EVENTS.json']", hasSize(10)));
    }

    /** A stable client shape matters more than a compact one: absent means [], never missing. */
    @Test
    void aRecipeWithNoRunsMapsToAnEmptyArrayRatherThanBeingOmitted() throws Exception {
        mvc.perform(get("/api/operational/runs").param("recipe", "_ETL_does_not_exist.json"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.byRecipe['_ETL_does_not_exist.json']", hasSize(0)));
    }

    @Test
    void moreThanTwoHundredRecipesIsRejectedWithAMessageNamingTheLimit() throws Exception {
        var request = get("/api/operational/runs");
        for (int i = 0; i < 201; i++) request = request.param("recipe", "r" + i + ".json");
        mvc.perform(request)
           .andExpect(status().isBadRequest())
           .andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("200")));
    }

    @Test
    void limitAboveFiftyIsRejected() throws Exception {
        mvc.perform(get("/api/operational/runs").param("recipe", "r.json").param("limit", "51"))
           .andExpect(status().isBadRequest());
    }
```

- [x] **Step 2: Run to verify it fails**

```bash
mvn -q -pl backend test -Dtest=ClusterEndpointsContractTest
```

Expected: FAIL — 404 on `/api/operational/runs`.

- [x] **Step 3: Write the DTO**

Create `backend/src/main/java/io/pure360/etl360/api/dto/RunsDto.java`:

```java
package io.pure360.etl360.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import java.util.Map;

/**
 * Run history by recipe, newest-first. The single source both Tab 3's cards and Tab 4's Operational
 * State read, replacing the per-date snapshot fan-out. {@code appStartIso} is what the Cloud
 * Logging deep link's cursorTimestamp is derived from.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record RunsDto(int limit, Map<String, List<RunDto>> byRecipe) {

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RunDto(String date, String clusterName, String jobId, String appStartIso,
                         Double durationMin, String status, String message) {}
}
```

- [x] **Step 4: Add the endpoint**

Append to `ClusterController`:

```java
    static final int MAX_RECIPES = 200;
    static final int MAX_LIMIT = 50;
    static final int DEFAULT_LIMIT = 10;

    /**
     * Run history for up to {@link #MAX_RECIPES} recipes at once. The bound exists so a caller
     * cannot relocate the scale problem into this endpoint; the frontend's useRuns() chunks its
     * recipe list to respect it, so the limit never surfaces to a user.
     */
    @GetMapping("/runs")
    public RunsDto runs(@RequestParam("recipe") List<String> recipes,
                        @RequestParam(name = "limit", defaultValue = "" + DEFAULT_LIMIT) int limit) {
        if (recipes.size() > MAX_RECIPES) {
            throw new InvalidRequestException("Too many recipes: " + recipes.size()
                + " — at most " + MAX_RECIPES + " per request. Chunk the list client-side.");
        }
        if (limit < 1 || limit > MAX_LIMIT) {
            throw new InvalidRequestException("limit must be between 1 and " + MAX_LIMIT + ", got " + limit);
        }
        Map<String, List<ClusterIndexService.RunEntry>> byRecipe = index.index().runsByRecipe();
        Map<String, List<RunsDto.RunDto>> out = new LinkedHashMap<>();
        for (String recipe : recipes) {
            List<ClusterIndexService.RunEntry> runs = byRecipe.getOrDefault(recipe, List.of());
            List<RunsDto.RunDto> newestFirst = new ArrayList<>();
            for (int i = runs.size() - 1; i >= 0 && newestFirst.size() < limit; i--) {
                ClusterIndexService.RunEntry r = runs.get(i);
                newestFirst.add(new RunsDto.RunDto(r.date(), r.clusterName(), r.jobId(),
                    r.appStartIso(), r.durationMin(), r.status(), r.message()));
            }
            out.put(recipe, List.copyOf(newestFirst));
        }
        return new RunsDto(limit, out);
    }
```

Add imports: `io.pure360.etl360.api.dto.RunsDto`, `org.springframework.web.bind.annotation.RequestParam`.

- [x] **Step 5: Confirm the 400 exception type**

Check which exception `ApiExceptionHandler` maps to 400 with a `detail` field:

```bash
grep -n "BAD_REQUEST\|InvalidDateException\|ExceptionHandler" backend/src/main/java/io/pure360/etl360/api/ApiExceptionHandler.java
ls backend/src/main/java/io/pure360/etl360/service/support/
```

Use the existing 400-mapped exception. If only `InvalidDateException` exists, create
`backend/src/main/java/io/pure360/etl360/service/support/InvalidRequestException.java` as a sibling
(same shape, extending `RuntimeException` with a `String message` constructor) and add an
`@ExceptionHandler` clause for it in `ApiExceptionHandler` mirroring the `InvalidDateException`
clause exactly — same status, same problem-detail shape. Import it in `ClusterController`.

- [x] **Step 6: Run the tests**

```bash
mvn -q -pl backend test -Dtest=ClusterEndpointsContractTest
```

Expected: PASS, 13 tests.

- [x] **Step 7: Commit**

```bash
git add backend/src/main/java/io/pure360/etl360/api/dto/RunsDto.java \
        backend/src/main/java/io/pure360/etl360/api/ClusterController.java \
        backend/src/main/java/io/pure360/etl360/service/support/ \
        backend/src/main/java/io/pure360/etl360/api/ApiExceptionHandler.java \
        backend/src/test/java/io/pure360/etl360/ClusterEndpointsContractTest.java \
        docs/superpowers/plans/2026-08-27-operational-scale.md
git commit -m "feat(api): GET /api/operational/runs — run history by recipe

Newest-first, default 10 per recipe, up to 200 recipes per call. Replaces Tab
4's per-date snapshot fan-out and gives both tabs the job_id + app_start_iso a
run-scoped Cloud Logging link needs. Absent recipes map to [] so the client
shape is stable."
```

---

### Task 6: `GET /api/relationships?clusters=` with 1-hop neighbours

**Files:**
- Modify: `backend/src/main/java/io/pure360/etl360/service/RelationshipService.java`
- Modify: `backend/src/main/java/io/pure360/etl360/api/RelationshipController.java`
- Modify: `backend/src/main/java/io/pure360/etl360/api/dto/RelationshipsDto.java`
- Create: `backend/src/test/java/io/pure360/etl360/ScopedRelationshipsContractTest.java`

**Interfaces:**
- Consumes: `ClusterIndexService.recipesIn()`, `.clustersOf()`.
- Produces, for Tasks 12–14: `NodeDto` gains `clusterNames: List<String>` and `neighbor: Boolean`; `MetaDto` gains `scopedClusters: List<String>` and `neighborCount: Integer`. All four `NON_NULL`, so the **unscoped response is byte-identical to today's**.

**Why:** `RelationshipService.graph()` builds and returns the entire graph on every call with no way to ask for less (spec §1 cause 1). Scoping the existing endpoint rather than adding a new one keeps Tab 4, `CorpusContractTest` and `relationships_sweep.mts` calling exactly what they call today.

**Invariant that must not break:** the `writerLayerByTable` / `writeModeByTable` / `partitionTypeByTable` maps are built from the **whole** entries list even when scoped. They describe physical tables, not the selection — building them from the scoped subset would make a table's `writeMode` depend on which clusters you happen to have selected. The existing class comment explains the ordering hazard; scoping must not reintroduce it.

- [x] **Step 1: Write the failing test**

Create `backend/src/test/java/io/pure360/etl360/ScopedRelationshipsContractTest.java`:

```java
package io.pure360.etl360;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Scoping contract for /api/relationships?clusters= against the committed mock. */
@SpringBootTest
@AutoConfigureMockMvc
class ScopedRelationshipsContractTest {
    @Autowired MockMvc mvc;
    private final ObjectMapper json = new ObjectMapper();

    private JsonNode graph(String query) throws Exception {
        return json.readTree(mvc.perform(get("/api/relationships" + query))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    /** The single most important assertion here: today's callers must see today's bytes. */
    @Test
    void anUnscopedRequestIsUnchangedAndCarriesNoneOfTheNewFields() throws Exception {
        String body = mvc.perform(get("/api/relationships"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain("neighbor");
        assertThat(body).doesNotContain("clusterNames");
        assertThat(body).doesNotContain("scopedClusters");
        assertThat(body).doesNotContain("neighborCount");
    }

    @Test
    void aScopedRequestIsAStrictSubsetOfTheFullGraph() throws Exception {
        int full = graph("").get("nodes").size();
        int scoped = graph("?clusters=cluster-wf-cas-load-4001").get("nodes").size();

        assertThat(scoped).isPositive().isLessThan(full);
    }

    @Test
    void everyCoreRecipeInScopeCarriesItsClusterNameAndIsNotFlaggedAsANeighbour() throws Exception {
        JsonNode g = graph("?clusters=cluster-wf-cas-load-4001");

        long core = 0;
        for (JsonNode n : g.get("nodes")) {
            if (!"recipe".equals(n.path("kind").asText())) continue;
            if (n.path("neighbor").asBoolean(false)) continue;
            core++;
            assertThat(n.path("clusterNames").toString()).contains("cluster-wf-cas-load-4001");
        }
        assertThat(core).isEqualTo(5);   // Task 1's 5-recipe cluster
    }

    @Test
    void neighboursAreIncludedAndFlaggedAndCountedInMeta() throws Exception {
        JsonNode g = graph("?clusters=cluster-wf-cas-load-4001");

        long flagged = 0;
        for (JsonNode n : g.get("nodes")) if (n.path("neighbor").asBoolean(false)) flagged++;

        assertThat(flagged).isPositive();
        assertThat(g.get("meta").get("neighborCount").asInt()).isEqualTo((int) flagged);
        assertThat(g.get("meta").get("scopedClusters").toString()).contains("cluster-wf-cas-load-4001");
    }

    /** 1 hop means 1 hop: a neighbour's neighbour is not pulled in. */
    @Test
    void neighboursAreNotExpandedASecondTime() throws Exception {
        JsonNode scoped = graph("?clusters=cluster-wf-cas-load-4001");
        JsonNode full = graph("");

        assertThat(scoped.get("nodes").size()).isLessThan(full.get("nodes").size());
        // Every edge must have at least one endpoint that is a non-neighbour node.
        java.util.Set<String> core = new java.util.HashSet<>();
        for (JsonNode n : scoped.get("nodes")) {
            if (!n.path("neighbor").asBoolean(false)) core.add(n.get("id").asText());
        }
        for (JsonNode e : scoped.get("edges")) {
            assertThat(core.contains(e.get("from").asText()) || core.contains(e.get("to").asText()))
                .as("edge %s -> %s joins two neighbours", e.get("from").asText(), e.get("to").asText())
                .isTrue();
        }
    }

    @Test
    void severalClustersUnionTheirRecipes() throws Exception {
        int one = graph("?clusters=cluster-wf-cas-load-4001").get("nodes").size();
        int two = graph("?clusters=cluster-wf-cas-load-4001,cluster-wf-cas-out-4003").get("nodes").size();

        assertThat(two).isGreaterThan(one);
    }

    /** A stale UI selection must degrade to "nothing here", not to an error page. */
    @Test
    void anUnknownClusterYieldsAnEmptyScopedGraphNotA404() throws Exception {
        JsonNode g = graph("?clusters=no-such-cluster");

        assertThat(g.get("nodes")).isEmpty();
        assertThat(g.get("meta").get("scopedClusters").toString()).contains("no-such-cluster");
    }

    /** A table's physical metadata must not depend on which clusters happen to be selected.
     *
     *  SUPERSEDED — see Task 6 Deviation 2. This version is VACUOUS: `if (!n.hasNonNull("writeMode"))
     *  continue;` skips every node the forbidden mutation strips, and `layer` is never compared, so
     *  it stays green when the lookup maps ARE narrowed to the scoped subset. Verified by mutation.
     *  Do not copy this block; read the shipped ScopedRelationshipsContractTest instead. */
    @Test
    void tableWriteModeIsResolvedFromTheWholeGraphNotTheSelection() throws Exception {
        JsonNode scoped = graph("?clusters=cluster-wf-cas-core-4002");
        JsonNode full = graph("");

        java.util.Map<String, String> fullModes = new java.util.HashMap<>();
        for (JsonNode n : full.get("nodes")) {
            if (n.hasNonNull("writeMode")) fullModes.put(n.get("id").asText(), n.get("writeMode").asText());
        }
        for (JsonNode n : scoped.get("nodes")) {
            if (!n.hasNonNull("writeMode")) continue;
            assertThat(n.get("writeMode").asText()).isEqualTo(fullModes.get(n.get("id").asText()));
        }
    }
}
```

- [x] **Step 2: Run to verify it fails**

```bash
mvn -q -pl backend test -Dtest=ScopedRelationshipsContractTest
```

Expected: FAIL — the scoped request returns the full graph, so the subset and neighbour assertions fail.

- [x] **Step 3: Extend the DTO**

In `RelationshipsDto.java`, extend the two nested records (keeping every existing field in place and in order, so the unscoped JSON is unchanged):

```java
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record NodeDto(String id, String kind, String name, String layer,
                          String mappingPath, Boolean hasRecipe, String workflow,
                          Integer executionOrder, String writeMode, String partitionType,
                          List<String> clusterNames, Boolean neighbor) {

        /** Pre-scoping arity — every unscoped call site keeps its existing shape. */
        public NodeDto(String id, String kind, String name, String layer, String mappingPath,
                       Boolean hasRecipe, String workflow, Integer executionOrder,
                       String writeMode, String partitionType) {
            this(id, kind, name, layer, mappingPath, hasRecipe, workflow, executionOrder,
                 writeMode, partitionType, null, null);
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record MetaDto(int entryCount, int skippedRows, List<String> layers,
                          List<String> scopedClusters, Integer neighborCount) {

        public MetaDto(int entryCount, int skippedRows, List<String> layers) {
            this(entryCount, skippedRows, layers, null, null);
        }
    }
```

- [x] **Step 4: Scope the service**

In `RelationshipService.java`: inject `ClusterIndexService clusterIndex` alongside the existing two dependencies, keep `graph()` as `return graph(List.of());`, and restructure the builder:

```java
    public RelationshipsDto graph() {
        return graph(List.of());
    }

    /**
     * @param clusterNames empty -> the whole graph, byte-identical to the pre-scoping response.
     *        Non-empty -> only recipes that ran in those clusters, plus the 1-hop nodes adjacent to
     *        the tables they touch, flagged {@code neighbor=true}. Unknown names contribute nothing
     *        and are echoed in {@code meta.scopedClusters} rather than raising a 404.
     */
    public RelationshipsDto graph(Collection<String> clusterNames) {
        List<LayerToLayerEntryDto> entries = layerToLayer.entries();
        boolean scoped = clusterNames != null && !clusterNames.isEmpty();

        Map<String, String> recipePathByFileName = new LinkedHashMap<>();
        for (String path : corpus.allRecipePaths()) {
            String fileName = path.substring(path.lastIndexOf('/') + 1);
            recipePathByFileName.putIfAbsent(fileName, path);
        }

        // Whole-graph physical-table facts. Built from EVERY entry even when scoped: a table's
        // layer/writeMode/partitionType are properties of the table, not of the selection.
        Map<String, String> writerLayerByTable = new LinkedHashMap<>();
        Map<String, String> writeModeByTable = new LinkedHashMap<>();
        Map<String, String> partitionTypeByTable = new LinkedHashMap<>();
        for (LayerToLayerEntryDto entry : entries) {
            writerLayerByTable.putIfAbsent(entry.target(), entry.layer());
            for (LayerToLayerEntryDto.WriteMode wm : entry.targetsWriteMode()) {
                writeModeByTable.putIfAbsent(wm.targetTable(), wm.writeMode());
            }
            for (LayerToLayerEntryDto.Partition p : entry.targetPartition()) {
                partitionTypeByTable.putIfAbsent(p.targetTable(), p.partitionType());
            }
        }

        Map<String, RelationshipsDto.NodeDto> nodes = new LinkedHashMap<>();
        Set<RelationshipsDto.EdgeDto> edges = new LinkedHashSet<>();

        List<LayerToLayerEntryDto> core = entries;
        List<LayerToLayerEntryDto> rest = List.of();
        if (scoped) {
            Set<String> inScope = clusterIndex.recipesIn(clusterNames);
            core = entries.stream().filter(e -> inScope.contains(e.recipe())).toList();
            rest = entries.stream().filter(e -> !inScope.contains(e.recipe())).toList();
        }

        for (LayerToLayerEntryDto entry : core) {
            addEntry(entry, nodes, edges, recipePathByFileName, writerLayerByTable,
                writeModeByTable, partitionTypeByTable, scoped, false);
        }

        int neighborCount = 0;
        if (scoped) {
            Set<String> coreTables = new LinkedHashSet<>(nodes.keySet());
            for (LayerToLayerEntryDto entry : rest) {
                if (!touchesAny(entry, coreTables)) continue;
                int before = nodes.size();
                addEntry(entry, nodes, edges, recipePathByFileName, writerLayerByTable,
                    writeModeByTable, partitionTypeByTable, true, true);
                neighborCount += nodes.size() - before;
            }
        }

        List<String> layers = core.stream().map(LayerToLayerEntryDto::layer).distinct().sorted().toList();
        RelationshipsDto.MetaDto meta = scoped
            ? new RelationshipsDto.MetaDto(core.size(), layerToLayer.skippedRows(), layers,
                List.copyOf(clusterNames), neighborCount)
            : new RelationshipsDto.MetaDto(entries.size(), layerToLayer.skippedRows(), layers);
        return new RelationshipsDto(List.copyOf(nodes.values()), List.copyOf(edges), meta);
    }

    /** True when any table this entry reads or writes is already a node in the core subgraph. */
    private boolean touchesAny(LayerToLayerEntryDto entry, Set<String> tableIds) {
        if (tableIds.contains("table:" + entry.target())) return true;
        for (LayerToLayerEntryDto.SourceRef s : entry.sources()) {
            if (tableIds.contains("table:" + s.table())) return true;
        }
        for (String lookup : entry.lookupTables()) {
            if (tableIds.contains("table:" + lookup)) return true;
        }
        return false;
    }

    private void addEntry(LayerToLayerEntryDto entry,
            Map<String, RelationshipsDto.NodeDto> nodes, Set<RelationshipsDto.EdgeDto> edges,
            Map<String, String> recipePathByFileName, Map<String, String> writerLayerByTable,
            Map<String, String> writeModeByTable, Map<String, String> partitionTypeByTable,
            boolean scoped, boolean neighbor) {
        String recipeId = "recipe:" + entry.recipe();
        String recipePath = recipePathByFileName.get(entry.recipe());
        boolean hasRecipe = recipePath != null;
        String mappingPath = hasRecipe ? parentDir(recipePath) : null;
        addNode(nodes, new RelationshipsDto.NodeDto(recipeId, "recipe", entry.recipe(), entry.layer(),
            mappingPath, hasRecipe, entry.workflow(), entry.executionOrder(), null, null,
            scoped ? clusterIndex.clustersOf(entry.recipe()) : null,
            neighbor ? Boolean.TRUE : null));

        String targetId = "table:" + entry.target();
        addNode(nodes, tableNode(targetId, entry.target(), writerLayerByTable,
            writeModeByTable, partitionTypeByTable, entry, neighbor));
        edges.add(new RelationshipsDto.EdgeDto(recipeId, targetId, "writes"));

        for (LayerToLayerEntryDto.SourceRef source : entry.sources()) {
            String sourceId = "table:" + source.table();
            addNode(nodes, tableNode(sourceId, source.table(), writerLayerByTable,
                writeModeByTable, partitionTypeByTable, entry, neighbor));
            edges.add(new RelationshipsDto.EdgeDto(sourceId, recipeId, "source"));
        }

        for (String lookup : entry.lookupTables()) {
            String lookupId = "table:" + lookup;
            addNode(nodes, tableNode(lookupId, lookup, writerLayerByTable,
                writeModeByTable, partitionTypeByTable, entry, neighbor));
            edges.add(new RelationshipsDto.EdgeDto(lookupId, recipeId, "lookup"));
        }
    }
```

`tableNode` gains a trailing `boolean neighbor` parameter and passes `null, neighbor ? Boolean.TRUE : null` as its last two constructor arguments. `addNode`'s `putIfAbsent` is what keeps a table already present as core from being downgraded to a neighbour — core entries are always processed first.

`clustersOf` is called once per core/neighbour recipe. It scans `byCluster` linearly; at ~1 300 clusters × a few hundred scoped recipes that is acceptable for a scoped request and never runs at all when unscoped. **Do not** call it in the unscoped path.

- [x] **Step 5: Accept the parameter in the controller**

```java
    @GetMapping("/relationships")
    public RelationshipsDto relationships(
            @RequestParam(name = "clusters", required = false) List<String> clusters) {
        return relationships.graph(clusters == null ? List.of() : clusters);
    }
```

Spring binds both `?clusters=a,b` and repeated `?clusters=a&clusters=b` into `List<String>`, so both call shapes work with no extra parsing.

- [x] **Step 6: Fix the three existing `RelationshipService` call sites**

`RelationshipServiceTest` constructs the service directly at `:22`, `:131` and `:174`
(`new RelationshipService(l2l, corpus)`). The added constructor parameter breaks all three. Build a
real `ClusterIndexService` over a `B15Reader` pointed at a composer root with no b15 files:

```java
    private static ClusterIndexService emptyIndex() {
        // mockRoot must ALSO be a bogus path. DataRoots falls back to the mock tier whenever the
        // real composer root is absent, so passing the real "backend/src/main/resources/mock" here
        // would silently hand back the committed 14-day, 21-cluster index — the opposite of empty.
        // (Task 3's implementer hit exactly this: its "absent composer yields an empty index" test
        // passed against real mock data until the mockRoot was bogused out too.)
        Etl360Properties props = new Etl360Properties(
            "parser/src/main/resources/xmltobq", "does/not/exist",
            "does/not/exist/mock", "does/not/exist/either", null);
        return new ClusterIndexService(new B15Reader(new DataRoots(props)));
    }
```

and pass `emptyIndex()` as the third argument at all three sites. An empty index is correct for
those tests: they exercise the **unscoped** path, which never consults the index at all. Do not
introduce a mocking library — the repo uses none.

- [x] **Step 7: Run the scoped tests, then the whole suite**

```bash
mvn -q -pl backend test -Dtest=ScopedRelationshipsContractTest
mvn -q -am -pl backend clean test
grep -h "^Tests run:" backend/target/surefire-reports/*.txt \
  | awk -F'[ ,]+' '{t+=$3; f+=$5; e+=$7} END {print "tests="t, "failures="f, "errors="e}'
```

Expected: scoped test PASS (8 tests); full suite `failures=0 errors=0`, total **246**
(212 baseline + 5 `B15ReaderTest` + 8 `ClusterIndexServiceTest` + 13 `ClusterEndpointsContractTest`
+ 8 `ScopedRelationshipsContractTest`). Report the real number. If `CorpusContractTest` or the
`relationships_sweep`-adjacent assertions fail, the **unscoped path has moved** — fix the code, never
the test.

- [x] **Step 8: Commit**

```bash
git add backend/src/main/java/io/pure360/etl360/service/RelationshipService.java \
        backend/src/main/java/io/pure360/etl360/api/RelationshipController.java \
        backend/src/main/java/io/pure360/etl360/api/dto/RelationshipsDto.java \
        backend/src/test/java/io/pure360/etl360/ScopedRelationshipsContractTest.java \
        docs/superpowers/plans/2026-08-27-operational-scale.md
git commit -m "feat(api): scope /api/relationships by b15 cluster, with 1-hop neighbours

?clusters= filters the graph to recipes that ran in those clusters and adds the
nodes adjacent to the tables they touch, flagged neighbor=true so the UI can dim
them. Unknown names yield an empty scoped graph rather than a 404, so a stale
selection degrades gracefully.

The unscoped response is byte-identical: the four new fields are NON_NULL and a
test asserts none of their names appear in it. Table write-mode/partition maps
are still built from the whole entries list, so physical table facts cannot
change with the selection."
```

**Deviation 1 (Step 4 code vs. Step 1 test — the test wins):** as written, Step 4's `addEntry`
gave every *neighbour* entry its full node/edge set, including tables the core subgraph does not
hold. That is a second hop, and Step 1's `neighboursAreNotExpandedASecondTime` fails on it
(`edge recipe:_ETL_m_CAS_DWH_EVENTS_FACT.json -> table:CAS_DWH_EVENTS_FACT joins two
neighbours`). `addEntry` therefore takes an extra `Set<String> attachOnlyTo` — `null` for a core
entry, the core node-id set for a neighbour — and a neighbour contributes only its recipe node
plus the edges joining it to tables already present. Consequence for Tasks 12–14: **every node
flagged `neighbor: true` is a recipe**; no table is ever a neighbour, so `tableNode` dropped the
`boolean neighbor` parameter Step 4 asked for rather than carry a provably-always-false argument.
`NodeDto.neighbor` stays declared for tables, so widening the rule later needs no wire change.

**Deviation 2 (Step 1's invariant-2 test strengthened):**
`tableWriteModeIsResolvedFromTheWholeGraphNotTheSelection` skipped scoped nodes without a
`writeMode`, so it compared value-vs-value only. Narrowing the lookup maps to the selection does
not corrupt those fields, it DROPS them — verified by mutation: with the maps built from the
scoped subset the test stayed green. It now compares `layer`/`writeMode`/`partitionType`
absent-vs-present across every table in both graphs, and names `table:CAS_ODS_EVENTS` (in the
cas-core-4002 scope, written from cas-load-4001) as the non-vacuous case. The same mutation now
fails it on `layer` (`expected "ODS" but was "DWH"`).

**Deviation 3 (outside this task's file set, under an explicit coordinator ruling):**
`ClusterIndexService.clustersOf()` documented "name-ascending" but iterated `Index.byCluster()`,
which `build()` hands to `Map.copyOf` — iteration order unspecified and SALT-randomized per JVM
run. Task 6 is what makes it observable, since the list ships as `NodeDto.clusterNames`. Added
`out.sort(Comparator.naturalOrder())` plus a `ClusterIndexServiceTest` case over a recipe in ten
clusters. The cluster names in that test are deliberate: `MapN` iteration is a rotation of a
fixed hash-derived order, so short keys whose table order happens to be alphabetical let the
unsorted code pass ~1 run in 20 (observed). The chosen names do not rotate to sorted order, so
the RED was reproducible across three JVM runs.

**Step 7 actual:** 248 tests / 42 classes, `failures=0 errors=0`; 42 surefire reports vs. 42
`*Test.java` files.

**Fix round (coordinator override of the review's "non-blocking" label):** the first cut called
`clusterIndex.clustersOf()` once per core and per neighbour recipe, and every one of those calls
re-entered `ClusterIndexService.index()` -> `B15Reader.fingerprint()`, which directory-streams and
stats every dated export. A scoped request therefore cost `R+1` stat sweeps (~200k syscalls at
D=365, R=300; worse on a network filesystem) — a syscall storm inside the fix for a payload
problem. Two changes: (1) `graph()` reads the index **once** at the top of the scoped branch and
threads `Map<String, List<String>> clustersByRecipe` down to `addEntry`, whose nullness now also
carries "am I scoped"; `ClusterIndexService.recipesIn` gained an `(Index, Collection)` overload so
reusing the hoisted index does not cost a second sweep. (2) `Index` gained
`clustersByRecipe` — the build-time inverse of `byCluster`, populated in the existing row loop with
a `TreeSet` accumulator — so `clustersOf()` is an O(1) lookup and **Ruling 9's ordering guarantee
moved from a per-call `.sorted()` to build time**. `clustersOf`'s public signature is unchanged.
Both are pinned by mutation-verified tests: removing the `TreeSet` reddens two
`ClusterIndexServiceTest` cases, and removing the hoist reddens
`RelationshipServiceTest.aScopedGraphReadsTheClusterIndexOnceAndAnUnscopedOneNotAtAll`
(`expected: 1 but was: 5`). The unscoped path still never touches `ClusterIndexService`.
**Post-fix:** 250 tests / 42 classes, `failures=0 errors=0`.

---

# Part 2 — Unified run history & GCP deep links

### Task 7: One link builder, and a logging template that carries a cursor

**Files:**
- Create: `frontend/src/api/gcpLinks.ts`
- Create: `frontend/src/api/gcpLinks.test.ts`
- Modify: `backend/src/main/java/io/pure360/etl360/config/Etl360Properties.java`
- Modify: `backend/src/main/java/io/pure360/etl360/api/dto/AppConfigDto.java`
- Modify: `backend/src/main/java/io/pure360/etl360/api/ConfigController.java`
- Modify: `backend/src/main/resources/application.yml`
- Modify: `backend/src/test/java/io/pure360/etl360/api/ConfigControllerTest.java`
- Modify: `frontend/src/api/dagAdapter.ts` (re-export `fillGcpUrl` from its new home)

**Interfaces:**
- Consumes: `AppConfig` from `api/queries.ts`.
- Produces, for Tasks 9–10:
  - `fillGcpUrl(template: string | undefined, fallback: string, vars: Record<string, string>): string`
  - `buildLoggingUrl(cfg: AppConfig | undefined, v: { jobId: string; cursorTimestamp?: string }): string`
  - `buildDataprocJobUrl(cfg: AppConfig | undefined, v: { jobId: string }): string`
  - `buildDataprocClusterUrl(cfg: AppConfig | undefined, v: { clusterName: string }): string`
  - `DEFAULT_LOGGING_URL`, `DEFAULT_DATAPROC_JOB_URL`, `DEFAULT_DATAPROC_CLUSTER_URL`

**Why:** `OperationalCard.tsx:37-38` declares its own console bases instead of using the served templates, and builds the `app_id` href as a query-string shape with no `query=` expression and no `cursorTimestamp` (`:200`). The console answers that with "Failed to load default log scope." The side panel's link, which *does* use the template, works. After this task nothing outside `gcpLinks.ts` builds a console URL (spec §6.1, §6.2).

**Two behaviours the naive implementation gets wrong:**

1. **Matrix-safe encoding.** The console reads `;key=value` *path matrix* segments and expects an unencoded RFC-3339 timestamp there. Today's `fillGcpUrl` `encodeURIComponent`s everything, which would emit `%3A` for every colon in the timestamp. Placeholders declared matrix-safe (`cursorTimestamp`, `duration`) keep their colons.
2. **Empty-segment collapse.** With no resolvable run, `;cursorTimestamp=;` must not appear at all — the link has to degrade to the job-id-only query that already works.

- [x] **Step 1: Write the failing test**

Create `frontend/src/api/gcpLinks.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  fillGcpUrl, buildLoggingUrl, buildDataprocJobUrl, buildDataprocClusterUrl,
  DEFAULT_LOGGING_URL,
} from './gcpLinks'
import type { AppConfig } from './queries'

const CFG: AppConfig = {
  gcpProjectId: 'example-project',
  region: 'europe-southwest1',
  dataprocJobUrl: 'https://console.cloud.google.com/dataproc/jobs/{jobId}?project={project}&region={region}',
  dataprocClusterUrl: 'https://console.cloud.google.com/dataproc/clusters/{clusterName}?project={project}&region={region}',
  loggingUrl: DEFAULT_LOGGING_URL,
  loggingDuration: 'P31D',
  dwhControlMode: 'mock',
  composerMode: 'mock',
  corpusRoot: '/mock',
}

describe('fillGcpUrl', () => {
  it('percent-encodes ordinary placeholders', () => {
    expect(fillGcpUrl('https://x/{a}?p={b}', 'unused', { a: 'v 1', b: 'w' }))
      .toBe('https://x/v%201?p=w')
  })

  it('prefers the served template over the fallback', () => {
    expect(fillGcpUrl('https://served/{a}', 'https://fallback/{a}', { a: 'z' }))
      .toBe('https://served/z')
    expect(fillGcpUrl(undefined, 'https://fallback/{a}', { a: 'z' }))
      .toBe('https://fallback/z')
  })

  // The console reads ;key=value as a path matrix segment; %3A there is not accepted.
  it('keeps the colons in a matrix-safe placeholder', () => {
    const url = fillGcpUrl('https://x/q;cursorTimestamp={cursorTimestamp}?p=1', 'unused',
      { cursorTimestamp: '2026-07-29T04:52:00Z' })
    expect(url).toBe('https://x/q;cursorTimestamp=2026-07-29T04:52:00Z?p=1')
    expect(url).not.toContain('%3A')
  })

  it('still encodes a non-matrix placeholder that contains a colon', () => {
    expect(fillGcpUrl('https://x/{a}', 'unused', { a: 'a:b' })).toBe('https://x/a%3Ab')
  })

  it('drops a matrix segment whose value is empty rather than emitting ";key="', () => {
    expect(fillGcpUrl('https://x/q;cursorTimestamp={cursorTimestamp};duration={duration}?p=1',
      'unused', { cursorTimestamp: '', duration: 'P31D' }))
      .toBe('https://x/q;duration=P31D?p=1')
  })

  it('drops a trailing empty matrix segment before the query string', () => {
    expect(fillGcpUrl('https://x/q;duration={duration}?p=1', 'unused', { duration: '' }))
      .toBe('https://x/q?p=1')
  })

  it('drops an empty matrix segment at the very end of the url', () => {
    expect(fillGcpUrl('https://x/q;duration={duration}', 'unused', { duration: '' }))
      .toBe('https://x/q')
  })
})

describe('buildLoggingUrl', () => {
  it('scopes the query to the job id and carries the run cursor and duration', () => {
    const url = buildLoggingUrl(CFG, { jobId: 'application_1_0001', cursorTimestamp: '2026-07-29T04:52:00Z' })

    expect(url).toContain('logs/query')
    expect(url).toContain('query=resource.labels.job_id')
    expect(url).toContain('application_1_0001')
    expect(url).toContain(';cursorTimestamp=2026-07-29T04:52:00Z')
    expect(url).toContain(';duration=P31D')
    expect(url).toContain('project=example-project')
  })

  // Degradation, not breakage: this is the shape that already works today.
  it('degrades to the job-id-only query when no run resolves', () => {
    const url = buildLoggingUrl(CFG, { jobId: 'application_1_0001' })

    expect(url).not.toContain('cursorTimestamp')
    expect(url).toContain('query=resource.labels.job_id')
    expect(url).toContain('application_1_0001')
  })

  it('falls back to the default duration when the config omits one', () => {
    expect(buildLoggingUrl({ ...CFG, loggingDuration: undefined }, {
      jobId: 'j', cursorTimestamp: '2026-07-29T04:52:00Z',
    })).toContain(';duration=P31D')
  })

  it('produces a usable url with no config at all', () => {
    expect(buildLoggingUrl(undefined, { jobId: 'j' })).toContain('logs/query')
  })
})

describe('buildDataprocJobUrl / buildDataprocClusterUrl', () => {
  it('fill project and region from the served config', () => {
    expect(buildDataprocJobUrl(CFG, { jobId: 'j1' }))
      .toBe('https://console.cloud.google.com/dataproc/jobs/j1?project=example-project&region=europe-southwest1')
    expect(buildDataprocClusterUrl(CFG, { clusterName: 'c1' }))
      .toBe('https://console.cloud.google.com/dataproc/clusters/c1?project=example-project&region=europe-southwest1')
  })
})
```

- [x] **Step 2: Run to verify it fails**

```bash
cd frontend && pnpm test gcpLinks
```

Expected: FAIL — `Failed to resolve import "./gcpLinks"`.

- [x] **Step 3: Write `gcpLinks.ts`**

Create `frontend/src/api/gcpLinks.ts`:

```ts
import type { AppConfig } from './queries'

// Byte-mirror of the backend application.yml gcp templates. The served AppConfigDto normally
// supplies them; these keep the app usable if /api/config has not resolved yet.
export const DEFAULT_DATAPROC_JOB_URL =
  'https://console.cloud.google.com/dataproc/jobs/{jobId}?project={project}&region={region}'
export const DEFAULT_DATAPROC_CLUSTER_URL =
  'https://console.cloud.google.com/dataproc/clusters/{clusterName}?project={project}&region={region}'
export const DEFAULT_LOGGING_URL =
  'https://console.cloud.google.com/logs/query;query=resource.labels.job_id%3D%22{jobId}%22;cursorTimestamp={cursorTimestamp};duration={duration}?project={project}'

export const DEFAULT_LOGGING_DURATION = 'P31D'

/**
 * Placeholders that land inside a `;key=value` PATH MATRIX segment rather than a query string.
 * The Cloud Logging console reads those segments literally and does not accept a percent-encoded
 * colon there, so an RFC-3339 timestamp must keep its colons. Everything else is encoded in full.
 */
const MATRIX_SAFE = new Set(['cursorTimestamp', 'duration'])

/** `;key=` with nothing after it, immediately before another segment, the query string, or the end. */
const EMPTY_MATRIX_SEGMENT = /;[A-Za-z0-9_]+=(?=[;?]|$)/g

/**
 * Substitutes `{placeholder}`s in a URL template.
 *
 * Two rules beyond plain substitution, both required for the produced URL to actually work:
 * matrix-safe placeholders keep their colons, and a matrix segment left empty is removed
 * entirely — never emitted as a bare `;key=`.
 */
export function fillGcpUrl(template: string | undefined, fallback: string,
    vars: Record<string, string>): string {
  const filled = (template || fallback).replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = vars[key] ?? ''
    if (value === '') return ''
    const encoded = encodeURIComponent(value)
    return MATRIX_SAFE.has(key) ? encoded.replace(/%3A/g, ':') : encoded
  })
  return filled.replace(EMPTY_MATRIX_SEGMENT, '')
}

/**
 * Cloud Logging, scoped to one Dataproc job and — when a run is selected — anchored at that run's
 * start. Without a cursor the link degrades to the job-id-only query, which is the shape that
 * works today; it never degrades to a broken one.
 */
export function buildLoggingUrl(cfg: AppConfig | undefined,
    v: { jobId: string; cursorTimestamp?: string }): string {
  return fillGcpUrl(cfg?.loggingUrl, DEFAULT_LOGGING_URL, {
    jobId: v.jobId,
    cursorTimestamp: v.cursorTimestamp ?? '',
    duration: cfg?.loggingDuration || DEFAULT_LOGGING_DURATION,
    project: cfg?.gcpProjectId ?? '',
  })
}

export function buildDataprocJobUrl(cfg: AppConfig | undefined, v: { jobId: string }): string {
  return fillGcpUrl(cfg?.dataprocJobUrl, DEFAULT_DATAPROC_JOB_URL, {
    jobId: v.jobId, project: cfg?.gcpProjectId ?? '', region: cfg?.region ?? '',
  })
}

export function buildDataprocClusterUrl(cfg: AppConfig | undefined, v: { clusterName: string }): string {
  return fillGcpUrl(cfg?.dataprocClusterUrl, DEFAULT_DATAPROC_CLUSTER_URL, {
    clusterName: v.clusterName, project: cfg?.gcpProjectId ?? '', region: cfg?.region ?? '',
  })
}
```

- [x] **Step 4: Point `dagAdapter.ts` at the new home**

In `frontend/src/api/dagAdapter.ts`, delete the `DEFAULT_DATAPROC_JOB_URL`, `DEFAULT_DATAPROC_CLUSTER_URL`, `DEFAULT_LOGGING_URL` constants and the `fillGcpUrl` function, and re-export from the new module so existing importers keep compiling until Task 10 moves them:

```ts
export { fillGcpUrl, DEFAULT_DATAPROC_JOB_URL, DEFAULT_DATAPROC_CLUSTER_URL, DEFAULT_LOGGING_URL } from './gcpLinks'
```

`frontend/src/api/dagAdapter.test.ts` currently asserts `fillGcpUrl` and `DEFAULT_LOGGING_URL`. Move those two cases out of it — they now live in `gcpLinks.test.ts` — and delete them from `dagAdapter.test.ts`.

- [x] **Step 5: Add `loggingDuration` to the backend config**

In `Etl360Properties.java`, replace the `Gcp` record with:

```java
    public record Gcp(String projectId, String region, String dataprocJobUrl,
                      String dataprocClusterUrl, String loggingUrl, String loggingDuration) {
        public static final String DEFAULT_LOGGING_DURATION = "P31D";

        /** Binding constructor: substitutes the default for an unset/blank logging-duration. */
        @ConstructorBinding
        public Gcp {
            loggingDuration = loggingDuration == null || loggingDuration.isBlank()
                ? DEFAULT_LOGGING_DURATION : loggingDuration.trim();
        }

        /** Pre-loggingDuration arity, kept so existing test call sites stay readable. */
        public Gcp(String projectId, String region, String dataprocJobUrl,
                   String dataprocClusterUrl, String loggingUrl) {
            this(projectId, region, dataprocJobUrl, dataprocClusterUrl, loggingUrl, DEFAULT_LOGGING_DURATION);
        }
    }
```

This mirrors the `LayerToLayer` pattern already in the same file — same `@ConstructorBinding` disambiguation, same "partial binding keeps the default" behaviour.

In `application.yml`, under `etl360.gcp`:

```yaml
    logging-url: "https://console.cloud.google.com/logs/query;query=resource.labels.job_id%3D%22{jobId}%22;cursorTimestamp={cursorTimestamp};duration={duration}?project={project}"
    logging-duration: ${ETL360_GCP_LOGGING_DURATION:P31D}
```

In `AppConfigDto.java` add `String loggingDuration` after `loggingUrl`; in `ConfigController.config()` pass `gcp.loggingDuration()` in the matching position.

- [x] **Step 6: Assert the served config carries it**

Append to `backend/src/test/java/io/pure360/etl360/api/ConfigControllerTest.java`:

```java
    @Test
    void servesTheLoggingDurationAndACursorAwareLoggingTemplate() throws Exception {
        mvc.perform(get("/api/config"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.loggingDuration").value("P31D"))
           .andExpect(jsonPath("$.loggingUrl").value(org.hamcrest.Matchers.containsString("{cursorTimestamp}")))
           .andExpect(jsonPath("$.loggingUrl").value(org.hamcrest.Matchers.containsString("{duration}")));
    }
```

- [x] **Step 7: Map the config key in `dev.sh` and the example config**

In `scripts/dev.sh`, alongside the existing `resolve` lines:

```bash
resolve ETL360_GCP_LOGGING_DURATION gcpLoggingDuration; SRC_GCP_DUR=$RES_SRC
```

and in the defaults block near `GCP="${ETL360_GCP_PROJECT:-db-dev-example-project}"`:

```bash
GCP_DUR="${ETL360_GCP_LOGGING_DURATION:-P31D}"
```

Add `"gcpLoggingDuration": "P31D"` to `config.example.json`. Verify:

```bash
bash scripts/dev.sh --check-config
```

Expected: the resolution dry-run prints without error and lists the new key.

- [x] **Step 8: Regenerate the API types and run both suites**

```bash
mvn -q -am -pl backend install -DskipTests && (cd backend && mvn -q spring-boot:run &) && sleep 25
make generate-api
lsof -ti tcp:8080 | xargs kill -9 2>/dev/null || true
mvn -q -pl backend test -Dtest=ConfigControllerTest,ConfigGcpProjectOverrideTest,LayerToLayerBindingTest
cd frontend && pnpm test gcpLinks dagAdapter && pnpm exec tsc --noEmit
```

Expected: all PASS; `types.gen.ts` now carries `loggingDuration`.

- [x] **Step 9: Commit**

```bash
git add frontend/src/api/gcpLinks.ts frontend/src/api/gcpLinks.test.ts \
        frontend/src/api/dagAdapter.ts frontend/src/api/dagAdapter.test.ts \
        frontend/src/api/types.gen.ts \
        backend/src/main/java/io/pure360/etl360/config/Etl360Properties.java \
        backend/src/main/java/io/pure360/etl360/api/dto/AppConfigDto.java \
        backend/src/main/java/io/pure360/etl360/api/ConfigController.java \
        backend/src/main/resources/application.yml \
        backend/src/test/java/io/pure360/etl360/api/ConfigControllerTest.java \
        scripts/dev.sh config.example.json \
        docs/superpowers/plans/2026-08-27-operational-scale.md
git commit -m "feat(links): one GCP url builder, and a run-anchored logging template

gcpLinks.ts becomes the only place a console URL is built, reading the served
templates. Two rules the naive version gets wrong are now tested directly:
matrix-safe placeholders keep their colons (the console rejects %3A inside a
;key=value segment), and an empty matrix segment is dropped rather than emitted
as a bare ;key= — so with no selected run the link degrades to the job-id-only
query that already works.

logging-url gains {cursorTimestamp}/{duration}; logging-duration is configurable
(ETL360_GCP_LOGGING_DURATION / config.json gcpLoggingDuration), default P31D."
```

---

### Task 8: `clusterQueries.ts` — index, detail, and chunked runs

**Files:**
- Create: `frontend/src/api/clusterQueries.ts`
- Create: `frontend/src/api/clusterQueries.test.ts`
- Modify: `frontend/src/types.ts`

**Interfaces:**
- Consumes: `apiGet` from `api/client.ts`, the generated `components['schemas']` types.
- Produces, for Tasks 9–17:
  - `type ClusterIndexT`, `ClusterSummaryT`, `ClusterDetailT`, `RunT`
  - `useClusterIndex(): UseQueryResult<ClusterIndexT>`
  - `useClusterDetail(name: string | null): UseQueryResult<ClusterDetailT>`
  - `useRuns(recipes: string[], limit?: number): { byRecipe: Record<string, RunT[]>; isLoading: boolean }`
  - `useScopedRelationships(clusters: string[]): UseQueryResult<RelationshipGraph>`
  - `chunk<T>(items: T[], size: number): T[][]`
  - `MAX_RECIPES_PER_REQUEST = 200`

**Why:** the `/runs` endpoint is bounded at 200 recipes (Task 5). A real cluster or DAG can exceed that, and the bound must never surface to a user as a 400 — so chunking lives in exactly one hook rather than being reimplemented per tab (spec §5.5 client rule).

- [x] **Step 1: Write the failing test**

Create `frontend/src/api/clusterQueries.test.ts`:

```ts
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { chunk, useRuns, useClusterIndex, MAX_RECIPES_PER_REQUEST } from './clusterQueries'

const seenRecipeCounts: number[] = []

const server = setupServer(
  http.get('*/api/operational/clusters', () => HttpResponse.json({
    mode: 'mock',
    dates: ['2026-07-28', '2026-07-29'],
    totals: { clusters: 2, recipes: 3, dates: 2, rows: 5 },
    clusters: [
      { name: 'cl-a', recipeCount: 2, dateIdx: [0, 1], rows: 4, ok: 3, ko: 1,
        lastDate: '2026-07-29', lastStatus: 'SUCCESS' },
      { name: 'cl-b', recipeCount: 1, dateIdx: [1], rows: 1, ok: 1, ko: 0,
        lastDate: '2026-07-29', lastStatus: 'SUCCESS' },
    ],
  })),
  http.get('*/api/operational/runs', ({ request }) => {
    const recipes = new URL(request.url).searchParams.getAll('recipe')
    seenRecipeCounts.push(recipes.length)
    return HttpResponse.json({
      limit: 10,
      byRecipe: Object.fromEntries(recipes.map(r => [r, [
        { date: '2026-07-29', clusterName: 'cl-a', jobId: `job-${r}`,
          appStartIso: '2026-07-29T04:52:00.000Z', durationMin: 1.5, status: 'SUCCESS', message: '' },
      ]])),
    })
  }),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => { server.resetHandlers(); seenRecipeCounts.length = 0 })
afterAll(() => server.close())

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('chunk', () => {
  it('splits into bounded groups and never drops an item', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 2)).toEqual([])
    expect(chunk([1], 5)).toEqual([[1]])
  })
})

describe('useClusterIndex', () => {
  it('loads the index', async () => {
    const { result } = renderHook(() => useClusterIndex(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data!.totals!.clusters).toBe(2)
    expect(result.current.data!.clusters).toHaveLength(2)
  })
})

describe('useRuns', () => {
  it('returns runs keyed by recipe', async () => {
    const { result } = renderHook(() => useRuns(['r1.json', 'r2.json']), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.byRecipe['r1.json'][0].jobId).toBe('job-r1.json')
    expect(result.current.byRecipe['r2.json']).toHaveLength(1)
  })

  // The endpoint 400s above 200. A DAG with more recipes than that must still work.
  it('chunks a recipe list larger than the endpoint bound', async () => {
    const many = Array.from({ length: MAX_RECIPES_PER_REQUEST + 1 }, (_, i) => `r${i}.json`)
    const { result } = renderHook(() => useRuns(many), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(seenRecipeCounts).toEqual([MAX_RECIPES_PER_REQUEST, 1])
    expect(Object.keys(result.current.byRecipe)).toHaveLength(MAX_RECIPES_PER_REQUEST + 1)
  })

  it('sends exactly one request at the bound', async () => {
    const exact = Array.from({ length: MAX_RECIPES_PER_REQUEST }, (_, i) => `r${i}.json`)
    const { result } = renderHook(() => useRuns(exact), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(seenRecipeCounts).toEqual([MAX_RECIPES_PER_REQUEST])
  })

  it('fetches nothing for an empty recipe list', async () => {
    const { result } = renderHook(() => useRuns([]), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(seenRecipeCounts).toEqual([])
    expect(result.current.byRecipe).toEqual({})
  })
})
```

- [x] **Step 2: Run to verify it fails**

```bash
cd frontend && pnpm test clusterQueries
```

Expected: FAIL — `Failed to resolve import "./clusterQueries"`.

- [x] **Step 3: Write `clusterQueries.ts`**

```ts
import { useQueries, useQuery } from '@tanstack/react-query'
import { apiGet } from './client'
import type { components } from './types.gen'
import type { RelationshipGraph } from './queries'

export type ClusterIndexT = components['schemas']['ClusterIndexDto']
export type ClusterSummaryT = components['schemas']['ClusterSummaryDto']
export type ClusterDetailT = components['schemas']['ClusterDetailDto']
export type RecipeInClusterT = components['schemas']['RecipeInClusterDto']
export type RunT = components['schemas']['RunDto']

const STALE_MS = 30_000

/** Mirrors ClusterController.MAX_RECIPES. Kept here so the bound is enforced before the request. */
export const MAX_RECIPES_PER_REQUEST = 200

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export const useClusterIndex = () =>
  useQuery({
    queryKey: ['clusterIndex'],
    queryFn: () => apiGet<ClusterIndexT>('/operational/clusters'),
    staleTime: STALE_MS,
  })

export const useClusterDetail = (name: string | null) =>
  useQuery({
    queryKey: ['clusterDetail', name],
    queryFn: () => apiGet<ClusterDetailT>(`/operational/clusters/${encodeURIComponent(name!)}`),
    staleTime: STALE_MS,
    enabled: !!name,
  })

/** Scoped graph. An empty cluster list fetches nothing — the empty canvas costs no request. */
export const useScopedRelationships = (clusters: string[]) => {
  const key = [...clusters].sort()
  return useQuery({
    queryKey: ['relationships', 'scoped', key.join(',')],
    queryFn: () => apiGet<RelationshipGraph>(
      `/relationships?${key.map(c => `clusters=${encodeURIComponent(c)}`).join('&')}`),
    staleTime: STALE_MS,
    enabled: key.length > 0,
  })
}

export interface RunsResult {
  byRecipe: Record<string, RunT[]>
  isLoading: boolean
}

/**
 * Run history for any number of recipes.
 *
 * `/api/operational/runs` is bounded at MAX_RECIPES_PER_REQUEST so one caller cannot relocate the
 * scale problem into it. A cluster or DAG can exceed that, so the list is chunked here — in ONE
 * place, rather than per tab — and the responses merged. The bound never reaches a user as a 400.
 */
export function useRuns(recipes: string[], limit = 10): RunsResult {
  const sorted = [...new Set(recipes)].sort()
  const groups = chunk(sorted, MAX_RECIPES_PER_REQUEST)

  return useQueries({
    queries: groups.map(group => ({
      queryKey: ['runs', limit, group.join(',')] as const,
      queryFn: () => apiGet<components['schemas']['RunsDto']>(
        `/operational/runs?limit=${limit}&${group.map(r => `recipe=${encodeURIComponent(r)}`).join('&')}`),
      staleTime: STALE_MS,
    })),
    combine: results => ({
      byRecipe: Object.assign({}, ...results.map(r => r.data?.byRecipe ?? {})) as Record<string, RunT[]>,
      isLoading: results.some(r => r.isLoading),
    }),
  })
}
```

- [x] **Step 4: Drop `appId` from the card type and add `RunT` re-export**

In `frontend/src/types.ts`, delete the `appId?: string` line from `OperationalCard` (`:131`). Leave `jobId?: string`. TypeScript will now flag every consumer — that is the point; Task 10 fixes them.

**Moved to Task 11 by explicit ruling** (Task 8 brief addendum, 2026-08-28): `appId`'s two consumers (`OperationalCard.tsx`, `dagAdapter.ts`) aren't rewritten until Tasks 10–11, so dropping the field here would leave `tsc --noEmit` red across three commits. Task 11 removes the field and both consumers together.

- [x] **Step 5: Run the tests**

```bash
cd frontend && pnpm test clusterQueries
```

Expected: PASS, 6 tests. (`tsc --noEmit` will still fail on `appId` consumers until Task 10 — that is expected and is checked there, not here.)

- [x] **Step 6: Commit**

```bash
git add frontend/src/api/clusterQueries.ts frontend/src/api/clusterQueries.test.ts \
        frontend/src/types.ts docs/superpowers/plans/2026-08-27-operational-scale.md
git commit -m "feat(api): cluster index / detail / scoped-graph hooks, with chunked runs

useRuns chunks its recipe list to the endpoint's 200-recipe bound in one place,
so a cluster or DAG larger than the bound still works and the limit never
surfaces as a 400. useScopedRelationships fetches nothing for an empty
selection — the empty canvas costs no request.

Also drops appId from the OperationalCard type; it always held the same value
as jobId. Consumers are fixed in the next task."
```

---

### Task 9: `RunPicker` — one selectable run history for both tabs

**Files:**
- Create: `frontend/src/components/shared/RunPicker.tsx`
- Create: `frontend/src/components/shared/RunPicker.test.tsx`

**Interfaces:**
- Consumes: `RunT` from `api/clusterQueries.ts`.
- Produces, for Tasks 10–11:
  - `formatRunLabel(run: RunT): string` — `"2026-07-29 · 04:52 UTC · 44m 37s · OK"`
  - `pickDefaultRun(runs: RunT[], preferredDate: string | null): RunT | null`
  - `<RunPicker runs selectedDate onSelect accent? limit? />`

**Why:** cards cap history at 5 status cells with no date, job id or timestamp (`types.ts:122` is a bare `StatusType[]`), so no run can be picked and no link can be scoped to a chosen execution. The user asked for 10, selectable, with the unselected runs **still visible**, driving the links — and asked explicitly that Tab 3 and Tab 4 not carry two implementations of it (spec §6.4).

- [x] **Step 1: Write the failing test**

Create `frontend/src/components/shared/RunPicker.test.tsx`:

```tsx
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { RunPicker, formatRunLabel, pickDefaultRun } from './RunPicker'
import type { RunT } from '../../api/clusterQueries'

afterEach(cleanup)

const run = (date: string, status = 'SUCCESS', hour = '04'): RunT => ({
  date, clusterName: 'cl-a', jobId: `job-${date}`,
  appStartIso: `${date}T${hour}:52:00.000Z`, durationMin: 44.62, status, message: '',
})

const TEN = Array.from({ length: 10 }, (_, i) => run(`2026-07-${String(20 + i).padStart(2, '0')}`))
  .reverse()   // served newest-first

describe('formatRunLabel', () => {
  it('reads date, UTC time, duration and outcome', () => {
    expect(formatRunLabel(run('2026-07-29'))).toBe('2026-07-29 · 04:52 UTC · 44m 37s · OK')
  })

  it('maps FAILED to KO and an unknown status to a dash', () => {
    expect(formatRunLabel(run('2026-07-29', 'FAILED'))).toContain('· KO')
    expect(formatRunLabel(run('2026-07-29', ''))).toContain('· —')
  })

  it('survives a missing duration and a missing timestamp', () => {
    expect(formatRunLabel({ ...run('2026-07-29'), durationMin: undefined })).toBe('2026-07-29 · 04:52 UTC · — · OK')
    expect(formatRunLabel({ ...run('2026-07-29'), appStartIso: '' })).toBe('2026-07-29 · 44m 37s · OK')
  })
})

describe('pickDefaultRun', () => {
  it('prefers the run on the requested date', () => {
    expect(pickDefaultRun(TEN, '2026-07-25')!.date).toBe('2026-07-25')
  })

  it('falls back to the newest run when the date has none', () => {
    expect(pickDefaultRun(TEN, '2020-01-01')!.date).toBe('2026-07-29')
    expect(pickDefaultRun(TEN, null)!.date).toBe('2026-07-29')
  })

  it('returns null for an empty history', () => {
    expect(pickDefaultRun([], '2026-07-25')).toBeNull()
  })
})

describe('RunPicker', () => {
  it('renders one bar per run, up to ten', () => {
    render(<RunPicker runs={TEN} selectedDate="2026-07-29" onSelect={() => {}} />)
    expect(screen.getAllByRole('button', { name: /^Run 2026-07-/ })).toHaveLength(10)
  })

  // The user's explicit requirement: unselected runs stay visible, just not highlighted.
  it('dims the unselected runs rather than hiding them', () => {
    render(<RunPicker runs={TEN} selectedDate="2026-07-25" onSelect={() => {}} />)
    const bars = screen.getAllByRole('button', { name: /^Run 2026-07-/ })
    const selected = screen.getByRole('button', { name: 'Run 2026-07-25' })

    expect(bars).toHaveLength(10)
    bars.forEach(bar => expect(bar).toBeVisible())
    expect(selected.style.opacity).toBe('1')
    expect(bars.filter(b => b !== selected).every(b => Number(b.style.opacity) < 1)).toBe(true)
  })

  it('marks the selected bar with aria-pressed', () => {
    render(<RunPicker runs={TEN} selectedDate="2026-07-25" onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: 'Run 2026-07-25' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Run 2026-07-24' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('emits the clicked run', () => {
    const onSelect = vi.fn()
    render(<RunPicker runs={TEN} selectedDate="2026-07-29" onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: 'Run 2026-07-22' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0].date).toBe('2026-07-22')
    expect(onSelect.mock.calls[0][0].jobId).toBe('job-2026-07-22')
  })

  it('shows the selected run label, and lists every run in the dropdown', () => {
    render(<RunPicker runs={TEN} selectedDate="2026-07-25" onSelect={() => {}} />)
    expect(screen.getByText(/2026-07-25 · 04:52 UTC/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Choose run/ }))

    expect(screen.getAllByRole('menuitem')).toHaveLength(10)
  })

  it('renders bars oldest to newest, left to right', () => {
    render(<RunPicker runs={TEN} selectedDate="2026-07-29" onSelect={() => {}} />)
    const names = screen.getAllByRole('button', { name: /^Run 2026-07-/ }).map(b => b.getAttribute('aria-label'))
    expect(names[0]).toBe('Run 2026-07-20')
    expect(names.at(-1)).toBe('Run 2026-07-29')
  })

  it('renders nothing for an empty history', () => {
    const { container } = render(<RunPicker runs={[]} selectedDate={null} onSelect={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [x] **Step 2: Run to verify it fails**

```bash
cd frontend && pnpm test RunPicker
```

Expected: FAIL — `Failed to resolve import "./RunPicker"`.

- [x] **Step 3: Write the component**

Create `frontend/src/components/shared/RunPicker.tsx`:

```tsx
import { useState } from 'react'
import type { RunT } from '../../api/clusterQueries'

const OK = '#34d399'
const KO = '#f87171'
const NONE = '#2a3050'

/** Opacity for a run that is present but not the one the links point at. Visible, not highlighted. */
const DIMMED = 0.55

function statusColor(status: string | undefined): string {
  return status === 'SUCCESS' ? OK : status === 'FAILED' ? KO : NONE
}

function outcome(status: string | undefined): string {
  return status === 'SUCCESS' ? 'OK' : status === 'FAILED' ? 'KO' : '—'
}

function durationLabel(durationMin: number | undefined): string {
  if (durationMin == null) return '—'
  const total = Math.round(durationMin * 60)
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`
}

/** `2026-07-29 · 04:52 UTC · 44m 37s · OK`. The UTC segment drops out if b15 carried no timestamp. */
export function formatRunLabel(run: RunT): string {
  const parts = [run.date ?? '']
  const iso = run.appStartIso ?? ''
  if (iso.length >= 16) parts.push(`${iso.slice(11, 16)} UTC`)
  parts.push(durationLabel(run.durationMin ?? undefined))
  parts.push(outcome(run.status))
  return parts.join(' · ')
}

/** The run a card should point at: the one on `preferredDate`, else the newest. */
export function pickDefaultRun(runs: RunT[], preferredDate: string | null): RunT | null {
  if (runs.length === 0) return null
  if (preferredDate) {
    const onDate = runs.find(r => r.date === preferredDate)
    if (onDate) return onDate
  }
  return runs[0]!   // served newest-first
}

/**
 * Selectable run history, shared by Tab 3's cards and Tab 4's Operational State so there is exactly
 * one implementation of "which execution do the links open".
 *
 * `runs` arrives newest-first (as `/api/operational/runs` serves it) and is rendered oldest-to-newest
 * left to right, matching the direction the previous read-only history strip used.
 */
export function RunPicker({ runs, selectedDate, onSelect, accent = '#4f9cf9', limit = 10 }: {
  runs: RunT[]
  selectedDate: string | null
  onSelect: (run: RunT) => void
  accent?: string
  limit?: number
}) {
  const [open, setOpen] = useState(false)
  if (runs.length === 0) return null

  const shown = runs.slice(0, limit)
  const oldestFirst = [...shown].reverse()
  const selected = shown.find(r => r.date === selectedDate) ?? shown[0]!

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
        {oldestFirst.map(run => {
          const isSelected = run.date === selected.date
          return (
            <button
              key={run.date}
              aria-label={`Run ${run.date}`}
              aria-pressed={isSelected}
              title={formatRunLabel(run)}
              onClick={e => { e.stopPropagation(); onSelect(run) }}
              style={{
                width: 7, height: 16, borderRadius: 1.5, padding: 0, cursor: 'pointer',
                background: statusColor(run.status),
                border: isSelected ? `1px solid ${accent}` : '1px solid transparent',
                opacity: isSelected ? 1 : DIMMED,
                flexShrink: 0,
              }}
            />
          )
        })}
      </div>

      <div style={{ position: 'relative' }}>
        <button
          aria-label="Choose run"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, width: '100%',
            background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4,
            color: 'var(--text-muted)', fontSize: 10, padding: '3px 7px', cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace', textAlign: 'left',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(selected.status), flexShrink: 0 }} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {formatRunLabel(selected)}
          </span>
          <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>

        {open && (
          <div
            role="menu"
            style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 2,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4,
              maxHeight: 190, overflowY: 'auto',
            }}
          >
            {shown.map(run => (
              <button
                key={run.date}
                role="menuitem"
                onClick={e => { e.stopPropagation(); onSelect(run); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                  background: run.date === selected.date ? 'var(--surface-3)' : 'transparent',
                  border: 'none', color: 'var(--text-muted)', fontSize: 10, padding: '4px 7px',
                  cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', textAlign: 'left',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(run.status), flexShrink: 0 }} />
                {formatRunLabel(run)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [x] **Step 4: Run the tests**

```bash
cd frontend && pnpm test RunPicker
```

Expected: PASS, 12 tests.

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/shared/RunPicker.tsx \
        frontend/src/components/shared/RunPicker.test.tsx \
        docs/superpowers/plans/2026-08-27-operational-scale.md
git commit -m "feat(operational): shared RunPicker — 10 selectable runs, none hidden

One implementation for both tabs, so 'which execution do the links open' is
answered in a single place. Every run stays visible; the selected one is at full
opacity with an accent ring, the rest at 0.55. The selected run carries the
job_id and app_start_iso the Logging deep link needs."
```

---

### Task 10: `OperationalCard` — three densities, one link row, readable labels

**Files:**
- Modify: `frontend/src/components/shared/OperationalCard.tsx`
- Create: `frontend/src/components/shared/OperationalCard.test.tsx`

**Interfaces:**
- Consumes: `RunPicker`, `pickDefaultRun` (Task 9); `buildLoggingUrl`, `buildDataprocJobUrl` (Task 7); `RunT` (Task 8).
- Produces, for Tasks 11–17: `<OperationalCard card density? selected? onClick? runs? selectedRunDate? onSelectRun? config? />` where `density: 'detailed' | 'compact' | 'minimal'` (default `'detailed'`).

**Why:** three separate defects live in this one file — the hardcoded console bases and the malformed `app_id` href (`:37-38`, `:198-214`), the fixed 5-cell read-only history (`:142-145`), and label text at 2.2:1 on `--surface-2` / 2.4:1 on `--surface` (`:121,136,142,163,170`). And the density control (spec §7.3) needs a third card silhouette that does not exist yet.

**Contrast, measured:** `#4a5570` is **2.2:1** on `--surface-2` and **2.4:1** on `--surface`. `var(--text-muted)` (`#7b88aa`) is **4.6:1** and **5.1:1** on those same backgrounds. Every `#4a5570` *text* colour inside this file moves to `var(--text-muted)`; the `PENDING` status swatch at `:9` is a fill, not text, and stays.

- [x] **Step 1: Write the failing test**

Create `frontend/src/components/shared/OperationalCard.test.tsx`:

```tsx
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { OperationalCard } from './OperationalCard'
import type { OperationalCard as CardData } from '../../types'
import type { RunT } from '../../api/clusterQueries'
import type { AppConfig } from '../../api/queries'
import { DEFAULT_LOGGING_URL } from '../../api/gcpLinks'

afterEach(cleanup)

const CARD: CardData = {
  id: 'recipe:_ETL_m_CAS_ODS_EVENTS.json', kind: 'recipe', name: '_ETL_m_CAS_ODS_EVENTS.json',
  layer: 'ODS', status: 'OK', lastRun: '2026-07-29T04:52:00.000Z',
  history: ['OK', 'OK', 'KO', 'OK'],
  stats: { avg_time_s: 90, p50: 80, p95: 120, p99: 120, avg_count: 0 },
  jobId: 'application_1_0001', relations: [],
}

const CONFIG: AppConfig = {
  gcpProjectId: 'example-project', region: 'europe-southwest1',
  dataprocJobUrl: 'https://console.cloud.google.com/dataproc/jobs/{jobId}?project={project}&region={region}',
  dataprocClusterUrl: 'https://console.cloud.google.com/dataproc/clusters/{clusterName}?project={project}&region={region}',
  loggingUrl: DEFAULT_LOGGING_URL, loggingDuration: 'P31D',
  dwhControlMode: 'mock', composerMode: 'mock', corpusRoot: '/mock',
}

const RUNS: RunT[] = ['2026-07-29', '2026-07-28', '2026-07-27'].map(date => ({
  date, clusterName: 'cluster-wf-cas-load-4001', jobId: `application_1_${date.slice(-2)}`,
  appStartIso: `${date}T04:52:00.000Z`, durationMin: 1.5, status: 'SUCCESS', message: '',
}))

describe('OperationalCard — link row', () => {
  // The core defect: app_id and job_id always carried the same value, and app_id's href
  // was a query-string shape with no query= expression, which the console rejects.
  it('has no app_id affordance at all', () => {
    render(<OperationalCard card={CARD} config={CONFIG} />)
    expect(screen.queryByText(/app_id/)).not.toBeInTheDocument()
  })

  it('offers job_id and Logging, both built from the served templates', () => {
    render(<OperationalCard card={CARD} config={CONFIG} runs={RUNS} selectedRunDate="2026-07-28" />)

    const job = screen.getByRole('link', { name: /job_id/ })
    expect(job).toHaveAttribute('href', expect.stringContaining('project=example-project'))
    expect(job).toHaveAttribute('href', expect.stringContaining('region=europe-southwest1'))

    const logging = screen.getByRole('link', { name: /Logging/ })
    expect(logging.getAttribute('href')).toContain('query=resource.labels.job_id')
  })

  it('anchors the Logging link at the SELECTED run, not the newest', () => {
    render(<OperationalCard card={CARD} config={CONFIG} runs={RUNS} selectedRunDate="2026-07-27" />)

    const href = screen.getByRole('link', { name: /Logging/ }).getAttribute('href')!
    expect(href).toContain('application_1_27')
    expect(href).toContain(';cursorTimestamp=2026-07-27T04:52:00.000Z')
    expect(href).not.toContain('%3A00%3A00')       // colons survive in the matrix segment
  })

  it('still produces a working Logging link when no runs are available', () => {
    render(<OperationalCard card={CARD} config={CONFIG} />)

    const href = screen.getByRole('link', { name: /Logging/ }).getAttribute('href')!
    expect(href).toContain('application_1_0001')   // falls back to card.jobId
    expect(href).not.toContain('cursorTimestamp')
  })
})

describe('OperationalCard — density', () => {
  it('detailed shows stats and the run history', () => {
    render(<OperationalCard card={CARD} density="detailed" runs={RUNS} selectedRunDate="2026-07-29" config={CONFIG} />)
    expect(screen.getByText('p95')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Run 2026-07-/ })).toHaveLength(3)
  })

  it('compact keeps identity and status but drops stats and history', () => {
    render(<OperationalCard card={CARD} density="compact" runs={RUNS} selectedRunDate="2026-07-29" config={CONFIG} />)
    expect(screen.getByText('_ETL_m_CAS_ODS_EVENTS.json')).toBeInTheDocument()
    expect(screen.getByText('ODS')).toBeInTheDocument()
    expect(screen.queryByText('p95')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: /^Run 2026-07-/ })).toHaveLength(0)
  })

  it('minimal is a single line of layer, name and status', () => {
    render(<OperationalCard card={CARD} density="minimal" config={CONFIG} />)
    expect(screen.getByText(/ODS/)).toBeInTheDocument()
    expect(screen.getByText('OK')).toBeInTheDocument()
    expect(screen.queryByText(/Last run/)).not.toBeInTheDocument()
  })

  it('defaults to detailed', () => {
    render(<OperationalCard card={CARD} config={CONFIG} />)
    expect(screen.getByText('p95')).toBeInTheDocument()
  })
})

describe('OperationalCard — contrast', () => {
  // #4a5570 measures 2.2:1 on --surface-2 and 2.4:1 on --surface; --text-muted is 4.6:1 / 5.1:1.
  it('uses no hardcoded #4a5570 for label text', () => {
    const { container } = render(<OperationalCard card={CARD} config={CONFIG} />)
    expect(container.innerHTML).not.toContain('#4a5570')
  })
})
```

- [x] **Step 2: Run to verify it fails**

```bash
cd frontend && pnpm test OperationalCard
```

Expected: FAIL — `app_id` is present, `density` is not a prop, `#4a5570` is in the markup.

- [x] **Step 3: Rewrite `OperationalCard.tsx`**

Apply these changes:

1. **Delete** `GCP_LOGGING_BASE` and `GCP_JOBS_BASE` (`:37-38`), the whole `card.appId` anchor block (`:198-214`), and the `HistoryBar` component (`:22-35`) — `RunPicker` replaces it.
2. **Import** `RunPicker`, `pickDefaultRun` from `./RunPicker`; `buildLoggingUrl`, `buildDataprocJobUrl` from `../../api/gcpLinks`; types `RunT` and `AppConfig`; and `CardDensity` from `../../types`.

   Add the density union to `frontend/src/types.ts` (which imports nothing) rather than declaring it
   here, and re-export it for convenience:

   ```ts
   // types.ts
   export type CardDensity = 'detailed' | 'compact' | 'minimal'
   ```
   ```ts
   // OperationalCard.tsx
   export type { CardDensity } from '../../types'
   ```

   `operationalView.ts` (Task 12) and `relationshipsAdapter.ts` (Task 15) both need this type. If it
   were declared in the component, a state module and an adapter module would import a component —
   the shape a later import cycle grows out of. `types.ts` is the leaf every layer may depend on.
3. **Signature:**

```tsx
export function OperationalCard({
  card, density = 'detailed', selected = false, onClick,
  runs = [], selectedRunDate = null, onSelectRun, config,
}: {
  card: CardData
  density?: CardDensity
  selected?: boolean
  onClick?: () => void
  /** Newest-first, from useRuns(). Empty -> no picker, and links fall back to card.jobId. */
  runs?: RunT[]
  selectedRunDate?: string | null
  onSelectRun?: (run: RunT) => void
  config?: AppConfig
}) {
```

4. **Link row** — replace both anchors with:

```tsx
  const selectedRun = pickDefaultRun(runs, selectedRunDate)
  const linkJobId = selectedRun?.jobId || card.jobId || ''
  const loggingHref = buildLoggingUrl(config, {
    jobId: linkJobId,
    cursorTimestamp: selectedRun?.appStartIso ?? '',
  })
  const jobHref = buildDataprocJobUrl(config, { jobId: linkJobId })
```

and render exactly two `<a>` rows — `job_id` (dataproc icon, `#4f9cf9`) and `Logging` (logging icon, `#818cf8`, taking the slot `app_id` vacated) — both guarded on `linkJobId !== ''`, both keeping the existing `onClick={e => e.stopPropagation()}`, `target="_blank"`, `rel="noopener noreferrer"` and pill styling.

5. **Density branches:**

- `minimal` — a single row: status dot, `card.layer`, `card.name` (ellipsized), `card.status`. Height ~26px, no links, no stats, no picker.
- `compact` — today's `compact` pill widened to a bordered box carrying the header row only (dot, name, layer chip, kind, status chip). No `Last run`, no stats, no picker, no links.
- `detailed` — today's full card, with `RunPicker` in place of `HistoryBar`:

```tsx
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          History (last {Math.min(runs.length, 10) || card.history.length})
          <InfoTooltip text="Each bar is one run. Click a bar to point the job_id and Logging links at that execution." placement="top" />
        </div>
        {runs.length > 0
          ? <RunPicker runs={runs} selectedDate={selectedRunDate} onSelect={r => onSelectRun?.(r)} />
          : <div style={{ display: 'flex', gap: 1.5 }}>
              {card.history.map((s, i) => (
                <div key={i} title={`Run ${card.history.length - i}: ${s}`} style={{
                  width: 5, height: 14, borderRadius: 1.5, flexShrink: 0,
                  background: s === 'OK' ? '#34d399' : s === 'KO' ? '#f87171' : '#2a3050',
                }} />
              ))}
            </div>}
      </div>
```

The `card.history` fallback keeps every existing caller rendering while Tasks 11–14 migrate them to `runs`.

6. **Contrast** — replace every `color: '#4a5570'` **text** declaration with `color: 'var(--text-muted)'` (`:121`, `:136`, `:142`, `:163`, `:170`). Leave `STATUS_COLOR.PENDING` at `:9` alone: it is a swatch fill, not text.

- [x] **Step 4: Run the tests**

```bash
cd frontend && pnpm test OperationalCard RunPicker
```

Expected: PASS, 22 tests across the two files.

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/shared/OperationalCard.tsx \
        frontend/src/components/shared/OperationalCard.test.tsx \
        docs/superpowers/plans/2026-08-27-operational-scale.md
git commit -m "fix(operational): remove app_id, add three card densities, fix label contrast

app_id and job_id always carried the same value (b15's job_id IS the YARN
application id), and app_id built its href by hand as a query-string shape with
no query= expression and no cursorTimestamp — which is what the console rejects
with 'Failed to load default log scope'. The card now builds nothing itself: it
calls gcpLinks, and both job_id and Logging point at the run selected in the
shared RunPicker.

Adds density detailed|compact|minimal for the collapse control, and moves label
text from #4a5570 (2.2:1 on --surface-2, 2.4:1 on --surface) to --text-muted
(4.6:1 / 5.1:1)."
```

---

### Task 11: Tab 4 stops fetching every date

**Files:**
- Delete: `frontend/src/api/dagQueries.ts`
- Modify: `frontend/src/api/dagAdapter.ts`
- Modify: `frontend/src/api/dagAdapter.test.ts`
- Modify: `frontend/src/components/tab4/ETLDag.tsx`
- Modify: `frontend/src/components/tab4/ETLDag.test.tsx`

**Interfaces:**
- Consumes: `useRuns` (Task 8), `RunPicker`/`pickDefaultRun` (Task 9), `OperationalCard` with `runs` (Task 10), `buildLoggingUrl`/`buildDataprocClusterUrl` (Task 7).
- Produces: `clusterRuns(cluster, dates, byRecipe)` and `toOperationalCard(task, runs, selectedDate)` — the two adapter functions whose signatures change.

**Why:** `useOperationalSnapshots(dates)` issues one request per available date and keeps every row of every day in memory to draw a run-history strip (spec §1 cause 3). Tab 4 needs exactly two things: all recipes' status **on the selected date** (one snapshot), and run history **for the selected DAG's tasks** (one chunked `/runs` call).

- [x] **Step 1: Write the failing adapter tests**

Replace the `clusterRuns` and `toOperationalCard` cases in `frontend/src/api/dagAdapter.test.ts` with:

```ts
import type { RunT } from './clusterQueries'

const runsFor = (recipe: string, spec: [string, string][]): RunT[] =>
  spec.map(([date, status]) => ({
    date, clusterName: 'cl-a', jobId: `job-${recipe}-${date}`,
    appStartIso: `${date}T04:00:00.000Z`, durationMin: 2, status, message: '',
  })).reverse()   // newest-first, as served

describe('clusterRuns', () => {
  it('reports one run per date, failing when any task failed that day', () => {
    const cluster = { dag_id: 'wf', schedule: '', last_run: '', status: 'skipped' as const,
      tasks: [
        { task_id: 'a.json', recipe_id: 'ODS/x', depends_on: [], last_status: 'skipped' as const, duration_s: 0, x: 0, y: 0 },
        { task_id: 'b.json', recipe_id: 'ODS/y', depends_on: [], last_status: 'skipped' as const, duration_s: 0, x: 0, y: 0 },
      ] }
    const byRecipe = {
      'a.json': runsFor('a', [['2026-07-28', 'SUCCESS'], ['2026-07-29', 'SUCCESS']]),
      'b.json': runsFor('b', [['2026-07-28', 'FAILED'], ['2026-07-29', 'SUCCESS']]),
    }

    const runs = clusterRuns(cluster, ['2026-07-28', '2026-07-29'], byRecipe)

    expect(runs.map(r => r.run_id)).toEqual(['2026-07-28', '2026-07-29'])
    expect(runs[0].status).toBe('failed')
    expect(runs[1].status).toBe('success')
  })

  it('marks a date with no runs as skipped', () => {
    const cluster = { dag_id: 'wf', schedule: '', last_run: '', status: 'skipped' as const,
      tasks: [{ task_id: 'a.json', recipe_id: 'ODS/x', depends_on: [], last_status: 'skipped' as const, duration_s: 0, x: 0, y: 0 }] }

    const runs = clusterRuns(cluster, ['2026-07-27', '2026-07-28'],
      { 'a.json': runsFor('a', [['2026-07-28', 'SUCCESS']]) })

    expect(runs[0].status).toBe('skipped')
    expect(runs[1].status).toBe('success')
  })
})

describe('toOperationalCard', () => {
  const task = { task_id: 'a.json', recipe_id: 'ODS/m_x', depends_on: ['b.json'],
    last_status: 'success' as const, duration_s: 0, x: 0, y: 0 }

  it('builds history and stats from the served runs', () => {
    const card = toOperationalCard(task,
      runsFor('a', [['2026-07-28', 'FAILED'], ['2026-07-29', 'SUCCESS']]), '2026-07-29')

    expect(card.history).toEqual(['KO', 'OK'])          // oldest-first, as the strip renders
    expect(card.status).toBe('OK')
    expect(card.layer).toBe('ODS')
    expect(card.stats.avg_time_s).toBe(120)
    expect(card.jobId).toBe('job-a-2026-07-29')
    expect(card.relations).toEqual(['b.json'])
  })

  it('takes its status from the SELECTED date, not the newest run', () => {
    const card = toOperationalCard(task,
      runsFor('a', [['2026-07-28', 'FAILED'], ['2026-07-29', 'SUCCESS']]), '2026-07-28')

    expect(card.status).toBe('KO')
    expect(card.jobId).toBe('job-a-2026-07-28')
  })

  it('is PENDING with no runs at all', () => {
    const card = toOperationalCard(task, [], '2026-07-29')
    expect(card.status).toBe('PENDING')
    expect(card.history).toEqual([])
  })

  // appId is gone from the type; it never held anything job_id did not.
  it('exposes no appId', () => {
    expect('appId' in toOperationalCard(task, [], '2026-07-29')).toBe(false)
  })
})
```

- [x] **Step 2: Run to verify it fails**

```bash
cd frontend && pnpm test dagAdapter
```

Expected: FAIL — `clusterRuns` and `toOperationalCard` still take `rowsByDate`.

- [x] **Step 3: Rewrite the two adapter functions**

In `dagAdapter.ts`, replace `clusterRuns` and `toOperationalCard` (keep `overlayRun`, `parseDurationSec`, `statusFromB15`, `toDagClusters`, `layoutTasks` and `STATUS_UP` exactly as they are — `overlayRun` is still fed by the single selected-date snapshot):

```ts
import type { RunT } from './clusterQueries'

const RUN_STATUS: Record<string, DagStatus> = { SUCCESS: 'success', FAILED: 'failed', RUNNING: 'running' }

const statusFromRun = (status: string | undefined): DagStatus => RUN_STATUS[status ?? ''] ?? 'skipped'

/** One DagRun per date: failed if any task failed that day, success if any ran, else skipped. */
export function clusterRuns(cluster: DagCluster, dates: string[],
    byRecipe: Record<string, RunT[]>): DagRun[] {
  return [...dates].sort().map(date => {
    const onDate = cluster.tasks
      .map(t => (byRecipe[t.task_id] ?? []).find(r => r.date === date))
      .filter((r): r is RunT => !!r)
    const statuses = new Set(onDate.map(r => statusFromRun(r.status)))
    const status: DagStatus = statuses.has('failed') ? 'failed'
      : statuses.has('success') || statuses.has('running') ? 'success' : 'skipped'
    return {
      run_id: date, dag_id: cluster.dag_id, status,
      started_at: onDate.map(r => r.appStartIso ?? '').sort().at(-1) ?? '',
      duration_s: onDate.reduce((s, r) => s + Math.round((r.durationMin ?? 0) * 60), 0),
    }
  })
}

/** An OperationalCard for one DAG task, from that recipe's run history (newest-first as served). */
export function toOperationalCard(task: DagTask, runs: RunT[], selectedDate: string): OperationalCard {
  const oldestFirst = [...runs].reverse()
  const history: StatusType[] = oldestFirst.map(r => STATUS_UP[statusFromRun(r.status)])
  const durations = oldestFirst
    .map(r => Math.round((r.durationMin ?? 0) * 60)).filter(n => n > 0).sort((a, b) => a - b)
  const pct = (p: number) => durations.length
    ? durations[Math.min(durations.length - 1, Math.max(0, Math.ceil((p / 100) * durations.length) - 1))]
    : 0
  const selected = runs.find(r => r.date === selectedDate)

  return {
    id: task.task_id, kind: 'recipe', name: task.task_id,
    layer: task.recipe_id.includes('/') ? task.recipe_id.slice(0, task.recipe_id.indexOf('/')) : '—',
    status: selected ? STATUS_UP[statusFromRun(selected.status)] : 'PENDING',
    lastRun: oldestFirst.at(-1)?.appStartIso || new Date(0).toISOString(),
    history,
    stats: {
      avg_time_s: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      p50: pct(50), p95: pct(95), p99: pct(99),
      avg_count: 0,   // b15 carries no row counts
    },
    jobId: selected?.jobId || undefined,
    relations: task.depends_on,
  }
}
```

- [x] **Step 4: Rewire `ETLDag.tsx`**

- Delete the `useOperationalSnapshots` import and call; delete `frontend/src/api/dagQueries.ts`.
- Replace with:

```tsx
  const snapshot = useOperational(selectedDate)                       // one date, every recipe
  const rowsForDate = (snapshot.data?.rows ?? []) as B15RowT[]
  const taskIds = useMemo(() => dag?.tasks.map(t => t.task_id) ?? [], [dag])
  const { byRecipe, isLoading: runsLoading } = useRuns(taskIds, 10)   // selected DAG only
  const [selectedRunDate, setSelectedRunDate] = useState<string | null>(null)
```

- `litDag` / `litClusters` keep calling `overlayRun(cluster, rowsForDate)` — unchanged.
- `runs` for the `RunHistory` strip: `clusterRuns(dag, dates, byRecipe)`.
- `card`: `selectedTask ? toOperationalCard(selectedTask, byRecipe[selectedTask.task_id] ?? [], selectedDate) : null`.
- Pass runs into the card so the picker appears in Operational State:

```tsx
  <OperationalCard
    card={card}
    config={config}
    runs={byRecipe[selectedTask.task_id] ?? []}
    selectedRunDate={selectedRunDate ?? selectedDate}
    onSelectRun={r => setSelectedRunDate(r.date)}
  />
```

- Replace the two hand-built hrefs (`:572`, `:587`) with `buildDataprocClusterUrl(config, { clusterName })` and `buildLoggingUrl(config, { jobId, cursorTimestamp })`, where `jobId`/`cursorTimestamp` come from the run selected in the picker:

```tsx
  const selectedRun = pickDefaultRun(byRecipe[selectedTask?.task_id ?? ''] ?? [], selectedRunDate ?? selectedDate)
  const loggingHref = buildLoggingUrl(config, {
    jobId: selectedRun?.jobId ?? selRow?.jobId ?? '',
    cursorTimestamp: selectedRun?.appStartIso ?? '',
  })
```

- Reset the run selection when the task changes: in the existing `onSelectTask` handler, also call `setSelectedRunDate(null)`.
- Include `runsLoading` in whatever loading condition the panel already uses.

- [x] **Step 5: Update `ETLDag.test.tsx`**

Its MSW handlers currently serve `/api/operational/{date}` for every date. Add a `/api/operational/runs` handler returning `{ limit: 10, byRecipe: { ... } }` for the fixture recipes, and keep exactly one `/api/operational/{date}` handler. Add one assertion that proves the fan-out is gone:

```tsx
  it('fetches one snapshot, not one per available date', async () => {
    const dateRequests: string[] = []
    server.use(http.get('*/api/operational/:date', ({ params }) => {
      dateRequests.push(String(params.date))
      return HttpResponse.json({ date: params.date, rows: [] })
    }))

    render(<ETLDag />, { wrapper })
    await screen.findByText(/wf_/)

    expect(new Set(dateRequests).size).toBeLessThanOrEqual(1)
  })
```

- [x] **Step 6: Run the frontend suite and the type check**

```bash
cd frontend && pnpm test && pnpm exec tsc --noEmit
```

Expected: all PASS, `tsc` clean — the `appId` removal from `types.ts` (Task 8) has no remaining consumers.

- [x] **Step 7: Commit**

```bash
git rm frontend/src/api/dagQueries.ts
git add frontend/src/api/dagAdapter.ts frontend/src/api/dagAdapter.test.ts \
        frontend/src/components/tab4/ETLDag.tsx frontend/src/components/tab4/ETLDag.test.tsx \
        docs/superpowers/plans/2026-08-27-operational-scale.md
git commit -m "perf(dag): one snapshot + one runs call, replacing the per-date fan-out

useOperationalSnapshots issued a request per available date and held every row
of every day in memory to draw a history strip. Tab 4 now fetches the selected
date's snapshot once for the canvas overlay and the selected DAG's run history
from /api/operational/runs.

Operational State gains the shared RunPicker, and its cluster and Logging links
are built by gcpLinks from the run selected there — same behaviour as Tab 3's
cards, one implementation."
```

---

# Part 3 — Tab 3 UI

### Task 12: View state that survives a tab switch

**Files:**
- Create: `frontend/src/state/operationalView.ts`
- Create: `frontend/src/state/operationalView.test.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx` (create if absent)

**Interfaces:**
- Consumes: nothing.
- Produces, for Tasks 13–18:
  - `CardDensity` is imported from `types.ts` (added in Task 10), never from the component
  - `interface OperationalViewState { selectedClusters: string[]; expandedCluster: string | null; deselectedRecipes: string[]; selectedDates: string[]; density: CardDensity; zoom: number; pan: { x: number; y: number }; selectedNode: string | null; selectedDate: string | null; selectedRunDate: string | null; paneWidth: number; paneCollapsed: boolean }`
  - `useOperationalView(): OperationalViewState`
  - `setOperationalView(patch: Partial<OperationalViewState>): void`
  - `resetOperationalView(): void` (tests only)
  - `PERSISTED_KEYS: readonly ['density', 'paneWidth', 'paneCollapsed']`

**Why:** the user reports recomputation on every return to Tab 3. React Query already caches the *data*; nothing caches the *view*. Two mechanisms are needed because they cover different halves: a store for logical state, and keeping visited tabs mounted for DOM state (scroll offsets) that no store can restore (spec §7.7).

**Why `useSyncExternalStore` and not context:** a context provider re-renders every consumer on any change; this store lets a component subscribe without the provider tree, and it is a React 19 built-in, so it costs no dependency (Global Constraints).

- [x] **Step 1: Write the failing test**

Create `frontend/src/state/operationalView.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOperationalView, setOperationalView, resetOperationalView, PERSISTED_KEYS } from './operationalView'

beforeEach(() => { localStorage.clear(); resetOperationalView() })
afterEach(() => { localStorage.clear() })

describe('operationalView', () => {
  it('starts with an empty selection and detailed density', () => {
    const { result } = renderHook(() => useOperationalView())
    expect(result.current.selectedClusters).toEqual([])
    expect(result.current.density).toBe('detailed')
    expect(result.current.selectedNode).toBeNull()
  })

  it('patches only the given keys', () => {
    const { result } = renderHook(() => useOperationalView())
    act(() => setOperationalView({ selectedClusters: ['cl-a'] }))

    expect(result.current.selectedClusters).toEqual(['cl-a'])
    expect(result.current.density).toBe('detailed')
  })

  it('notifies every subscriber', () => {
    const a = renderHook(() => useOperationalView())
    const b = renderHook(() => useOperationalView())
    act(() => setOperationalView({ zoom: 0.5 }))

    expect(a.result.current.zoom).toBe(0.5)
    expect(b.result.current.zoom).toBe(0.5)
  })

  // The point of the store: unmounting Tab 3 must not lose the view.
  it('survives an unmount and remount', () => {
    const first = renderHook(() => useOperationalView())
    act(() => setOperationalView({ selectedClusters: ['cl-a'], zoom: 1.4, selectedNode: 'recipe:x' }))
    first.unmount()

    const second = renderHook(() => useOperationalView())
    expect(second.result.current.selectedClusters).toEqual(['cl-a'])
    expect(second.result.current.zoom).toBe(1.4)
    expect(second.result.current.selectedNode).toBe('recipe:x')
  })

  it('persists only the durable preference keys', () => {
    renderHook(() => useOperationalView())
    act(() => setOperationalView({ density: 'minimal', paneWidth: 320, selectedClusters: ['cl-a'] }))

    const stored = JSON.parse(localStorage.getItem('etl360.tab3.view') ?? '{}')
    expect(Object.keys(stored).sort()).toEqual([...PERSISTED_KEYS].sort())
    expect(stored.density).toBe('minimal')
    expect(stored.selectedClusters).toBeUndefined()
  })

  it('rehydrates persisted preferences on first read', () => {
    localStorage.setItem('etl360.tab3.view', JSON.stringify({ density: 'compact', paneWidth: 300, paneCollapsed: true }))
    resetOperationalView()

    const { result } = renderHook(() => useOperationalView())
    expect(result.current.density).toBe('compact')
    expect(result.current.paneWidth).toBe(300)
    expect(result.current.paneCollapsed).toBe(true)
  })

  it('ignores corrupt persisted state rather than throwing', () => {
    localStorage.setItem('etl360.tab3.view', 'not json')
    resetOperationalView()

    expect(renderHook(() => useOperationalView()).result.current.density).toBe('detailed')
  })
})
```

- [x] **Step 2: Run to verify it fails**

```bash
cd frontend && pnpm test operationalView
```

Expected: FAIL — module not found.

- [x] **Step 3: Write the store**

Create `frontend/src/state/operationalView.ts`:

```ts
import { useSyncExternalStore } from 'react'
import type { CardDensity } from '../types'

export interface OperationalViewState {
  selectedClusters: string[]
  expandedCluster: string | null
  /** Recipes explicitly UNCHECKED inside an expanded cluster. Empty means "all of them". */
  deselectedRecipes: string[]
  /** Dates explicitly checked in the pane. Empty means "no date filter". */
  selectedDates: string[]
  density: CardDensity
  zoom: number
  pan: { x: number; y: number }
  selectedNode: string | null
  selectedDate: string | null
  selectedRunDate: string | null
  paneWidth: number
  paneCollapsed: boolean
}

const STORAGE_KEY = 'etl360.tab3.view'

/** Durable preferences. Everything else is session-lived: a selection should not outlive a reload. */
export const PERSISTED_KEYS = ['density', 'paneWidth', 'paneCollapsed'] as const

const DEFAULTS: OperationalViewState = {
  selectedClusters: [], expandedCluster: null, deselectedRecipes: [], selectedDates: [],
  density: 'detailed', zoom: 0.85, pan: { x: 40, y: 40 },
  selectedNode: null, selectedDate: null, selectedRunDate: null,
  paneWidth: 260, paneCollapsed: false,
}

function hydrate(): OperationalViewState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const stored = JSON.parse(raw) as Partial<OperationalViewState>
    const picked: Partial<OperationalViewState> = {}
    for (const key of PERSISTED_KEYS) {
      if (stored[key] !== undefined) (picked as Record<string, unknown>)[key] = stored[key]
    }
    return { ...DEFAULTS, ...picked }
  } catch {
    return { ...DEFAULTS }   // corrupt or unavailable storage must never break the tab
  }
}

let state: OperationalViewState = hydrate()
const listeners = new Set<() => void>()

function persist() {
  try {
    const out: Record<string, unknown> = {}
    for (const key of PERSISTED_KEYS) out[key] = state[key]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(out))
  } catch { /* private mode / quota — the view still works, it just will not be remembered */ }
}

export function setOperationalView(patch: Partial<OperationalViewState>): void {
  state = { ...state, ...patch }
  if (PERSISTED_KEYS.some(k => k in patch)) persist()
  listeners.forEach(l => l())
}

/** Test-only: drop in-memory state and re-read localStorage. */
export function resetOperationalView(): void {
  state = hydrate()
  listeners.forEach(l => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useOperationalView(): OperationalViewState {
  return useSyncExternalStore(subscribe, () => state, () => state)
}
```

- [x] **Step 4: Keep visited tabs mounted in `App.tsx`**

Replace the four conditional renders with a visited-set + `display:none` scheme:

```tsx
  const [visited, setVisited] = useState<Set<TabId>>(() => new Set<TabId>(['viewer']))

  const showTab = (tab: TabId) => {
    setActiveTab(tab)
    setSearchQuery('')
    setVisited(prev => prev.has(tab) ? prev : new Set(prev).add(tab))
  }
```

and in the body:

```tsx
          <>
            {/* Tabs mount on first visit and then STAY mounted, hidden. React Query caches the
                data and operationalView caches the logical view; this is what preserves the DOM
                state neither can — scroll offsets, and the canvas's own layout work. */}
            {visited.has('viewer') && (
              <div style={{ display: activeTab === 'viewer' ? 'contents' : 'none' }}>
                <ETLViewer searchQuery={activeTab === 'viewer' ? searchQuery : ''} />
              </div>
            )}
            {visited.has('modifier') && (
              <div style={{ display: activeTab === 'modifier' ? 'contents' : 'none' }}>
                <ETLModifier searchQuery={activeTab === 'modifier' ? searchQuery : ''} />
              </div>
            )}
            {visited.has('operational') && (
              <div style={{ display: activeTab === 'operational' ? 'contents' : 'none' }}>
                <ETLOperational />
              </div>
            )}
            {visited.has('dag') && (
              <div style={{ display: activeTab === 'dag' ? 'contents' : 'none' }}>
                <ETLDag />
              </div>
            )}
          </>
```

Wire the tab buttons to `showTab` instead of the inline `onTabChange` body.

`display: 'contents'` keeps the flex layout each tab already expects — a wrapper with `display:block` would break `flex: 1` children. Each hidden tab is `display:none`, which removes it from layout entirely, so a hidden canvas costs no paint.

- [x] **Step 5: Assert the mounting behaviour**

Create (or extend) `frontend/src/App.test.tsx`:

```tsx
  it('keeps a visited tab mounted after switching away', async () => {
    render(<App />, { wrapper })

    fireEvent.click(screen.getByRole('button', { name: /ETL Operational/ }))
    await screen.findByPlaceholderText(/Search tables/)

    fireEvent.click(screen.getByRole('button', { name: /ETL DAG/ }))

    // Still in the DOM, just not displayed — this is what makes the return instant.
    expect(screen.getByPlaceholderText(/Search tables/)).toBeInTheDocument()
  })

  it('does not mount a tab that was never visited', () => {
    render(<App />, { wrapper })
    expect(screen.queryByPlaceholderText(/Search tables/)).not.toBeInTheDocument()
  })
```

Use whatever MSW handler set `ETLOperational.test.tsx` already defines; import it or copy the minimal handlers.

- [x] **Step 6: Run the suite**

```bash
cd frontend && pnpm test operationalView App && pnpm exec tsc --noEmit
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add frontend/src/state/operationalView.ts frontend/src/state/operationalView.test.ts \
        frontend/src/App.tsx frontend/src/App.test.tsx \
        docs/superpowers/plans/2026-08-27-operational-scale.md
git commit -m "feat(tab3): cache the operational view across tab switches

Two mechanisms for two halves of the problem: a useSyncExternalStore-backed
store for logical view state (selection, density, zoom, pan, selected node),
and keeping visited tabs mounted under display:none for the DOM state no store
can restore. React Query already cached the data; nothing cached the view.

Only density, pane width and pane collapse persist to localStorage — a cluster
selection should not outlive a reload. Corrupt storage falls back to defaults
rather than breaking the tab."
```

---

### Task 13: `ClusterPane` and `SelectionStrip`

**Files:**
- Create: `frontend/src/components/tab3/ClusterPane.tsx`
- Create: `frontend/src/components/tab3/ClusterPane.test.tsx`
- Create: `frontend/src/components/tab3/SelectionStrip.tsx`
- Create: `frontend/src/components/tab3/SelectionStrip.test.tsx`

**Interfaces:**
- Consumes: `useClusterIndex`, `useClusterDetail` (Task 8); `useOperationalView`, `setOperationalView` (Task 12).
- Produces, for Task 14: `<ClusterPane />` and `<SelectionStrip />` — both read and write the store directly, so `ETLOperational` composes them without threading props.
- Also produces `ROW_H = 30` and `visibleRange(scrollTop, viewportH, count, rowH)` (exported for the windowing test).

**Why:** with nothing selected the app must fetch only the index; the pane is how a selection is made (spec §7.1). At ~1 300 clusters a naive `.map` over every row is the same class of mistake the expression dock made in sub-project 9 — so the list is windowed, by hand, with no dependency.

- [x] **Step 1: Write the failing tests**

Create `frontend/src/components/tab3/ClusterPane.test.tsx`:

```tsx
import { describe, expect, it, beforeAll, afterAll, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { ClusterPane, visibleRange, ROW_H } from './ClusterPane'
import { resetOperationalView, setOperationalView, useOperationalView } from '../../state/operationalView'
import { renderHook } from '@testing-library/react'

const MANY = Array.from({ length: 1000 }, (_, i) => ({
  name: `cl-${String(i).padStart(4, '0')}`, recipeCount: 3, dateIdx: [0, 1],
  rows: 6, ok: 5, ko: 1, lastDate: '2026-07-29', lastStatus: 'SUCCESS',
}))

const server = setupServer(
  http.get('*/api/operational/clusters/:name', ({ params }) => HttpResponse.json({
    name: params.name,
    dates: ['2026-07-28', '2026-07-29'],
    recipes: [
      { recipeFilename: 'r1.json', layer: 'STG', dateIdx: [0, 1], rows: 2, ok: 2, ko: 0,
        lastDate: '2026-07-29', lastStatus: 'SUCCESS' },
      { recipeFilename: 'r2.json', layer: 'ODS', dateIdx: [1], rows: 1, ok: 0, ko: 1,
        lastDate: '2026-07-29', lastStatus: 'FAILED' },
    ],
  })),
  http.get('*/api/operational/clusters', () => HttpResponse.json({
    mode: 'mock', dates: ['2026-07-28', '2026-07-29'],
    totals: { clusters: MANY.length, recipes: 3000, dates: 2, rows: 6000 },
    clusters: MANY,
  })),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => { server.resetHandlers(); cleanup() })
afterAll(() => server.close())
beforeEach(() => { localStorage.clear(); resetOperationalView() })

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('visibleRange', () => {
  it('windows around the scroll position with an overscan', () => {
    // viewport 300 / rowH 30 = 10 visible rows, plus OVERSCAN 5 on each side.
    expect(visibleRange(0, 300, 1000, ROW_H)).toEqual({ start: 0, end: 15 })
    expect(visibleRange(3000, 300, 1000, ROW_H)).toEqual({ start: 95, end: 115 })
  })

  it('clamps at both ends', () => {
    expect(visibleRange(-50, 300, 1000, ROW_H).start).toBe(0)
    expect(visibleRange(1e9, 300, 1000, ROW_H).end).toBe(1000)
    expect(visibleRange(0, 300, 3, ROW_H)).toEqual({ start: 0, end: 3 })
  })
})

describe('ClusterPane', () => {
  it('renders a bounded number of rows over a thousand clusters', async () => {
    render(<ClusterPane />, { wrapper })
    await screen.findByText('cl-0000')

    expect(screen.getAllByRole('checkbox', { name: /^cl-/ }).length).toBeLessThan(60)
    expect(screen.queryByText('cl-0999')).not.toBeInTheDocument()
  })

  it('shows the totals so the scale is visible before anything is selected', async () => {
    render(<ClusterPane />, { wrapper })
    expect(await screen.findByText(/1,000 clusters/)).toBeInTheDocument()
    expect(screen.getByText(/3,000 recipes/)).toBeInTheDocument()
  })

  it('filters by a case-insensitive substring of the cluster name', async () => {
    render(<ClusterPane />, { wrapper })
    await screen.findByText('cl-0000')

    fireEvent.change(screen.getByPlaceholderText(/Search clusters/), { target: { value: 'CL-0042' } })

    expect(await screen.findByText('cl-0042')).toBeInTheDocument()
    expect(screen.queryByText('cl-0000')).not.toBeInTheDocument()
  })

  it('checking a cluster writes it to the shared view state', async () => {
    const view = renderHook(() => useOperationalView())
    render(<ClusterPane />, { wrapper })
    await screen.findByText('cl-0000')

    fireEvent.click(screen.getByRole('checkbox', { name: 'cl-0003' }))

    await waitFor(() => expect(view.result.current.selectedClusters).toEqual(['cl-0003']))
  })

  it('supports several selected clusters and unchecking one', async () => {
    const view = renderHook(() => useOperationalView())
    render(<ClusterPane />, { wrapper })
    await screen.findByText('cl-0000')

    fireEvent.click(screen.getByRole('checkbox', { name: 'cl-0001' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'cl-0002' }))
    await waitFor(() => expect(view.result.current.selectedClusters).toHaveLength(2))

    fireEvent.click(screen.getByRole('checkbox', { name: 'cl-0001' }))
    await waitFor(() => expect(view.result.current.selectedClusters).toEqual(['cl-0002']))
  })

  it('expanding a cluster lazily loads its recipes and dates', async () => {
    render(<ClusterPane />, { wrapper })
    await screen.findByText('cl-0000')

    fireEvent.click(screen.getByRole('button', { name: 'Expand cl-0005' }))

    expect(await screen.findByRole('checkbox', { name: 'r1.json' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'r2.json' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '2026-07-28' })).toBeInTheDocument()
  })

  it('fetches no detail until a row is expanded', async () => {
    const detailCalls: string[] = []
    server.use(http.get('*/api/operational/clusters/:name', ({ params }) => {
      detailCalls.push(String(params.name))
      return HttpResponse.json({ name: params.name, dates: [], recipes: [] })
    }))

    render(<ClusterPane />, { wrapper })
    await screen.findByText('cl-0000')

    expect(detailCalls).toEqual([])
  })

  it('unchecking a recipe records it as deselected', async () => {
    const view = renderHook(() => useOperationalView())
    render(<ClusterPane />, { wrapper })
    await screen.findByText('cl-0000')
    fireEvent.click(screen.getByRole('button', { name: 'Expand cl-0005' }))
    await screen.findByRole('checkbox', { name: 'r2.json' })

    fireEvent.click(screen.getByRole('checkbox', { name: 'r2.json' }))

    await waitFor(() => expect(view.result.current.deselectedRecipes).toEqual(['r2.json']))
  })

  it('collapses to a strip and restores', async () => {
    render(<ClusterPane />, { wrapper })
    await screen.findByText('cl-0000')

    fireEvent.click(screen.getByRole('button', { name: /Collapse cluster pane/ }))
    expect(screen.queryByPlaceholderText(/Search clusters/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Expand cluster pane/ }))
    expect(await screen.findByPlaceholderText(/Search clusters/)).toBeInTheDocument()
  })

  it('reads its width from the persisted view state', async () => {
    setOperationalView({ paneWidth: 320 })
    render(<ClusterPane />, { wrapper })
    await screen.findByText('cl-0000')

    expect(screen.getByTestId('cluster-pane').style.width).toBe('320px')
  })
})
```

Create `frontend/src/components/tab3/SelectionStrip.test.tsx`:

```tsx
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SelectionStrip } from './SelectionStrip'
import { resetOperationalView, setOperationalView } from '../../state/operationalView'

beforeEach(() => { localStorage.clear(); resetOperationalView() })
afterEach(cleanup)

const SUMMARY = { recipes: 187, dates: 14, ok: 1842, ko: 6, nodes: 312, neighbors: 41 }

describe('SelectionStrip', () => {
  it('renders nothing when no cluster is selected', () => {
    const { container } = render(<SelectionStrip summary={SUMMARY} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('names every selected cluster and the aggregate counts', () => {
    setOperationalView({ selectedClusters: ['cl-a', 'cl-b', 'cl-c'] })
    render(<SelectionStrip summary={SUMMARY} />)

    expect(screen.getByText('cl-a')).toBeInTheDocument()
    expect(screen.getByText('cl-c')).toBeInTheDocument()
    expect(screen.getByText(/3 clusters/)).toBeInTheDocument()
    expect(screen.getByText(/187 recipes/)).toBeInTheDocument()
    expect(screen.getByText(/1,842 OK/)).toBeInTheDocument()
    expect(screen.getByText(/6 KO/)).toBeInTheDocument()
  })

  it('states how many nodes came from neighbouring clusters', () => {
    setOperationalView({ selectedClusters: ['cl-a'] })
    render(<SelectionStrip summary={SUMMARY} />)
    expect(screen.getByText(/312 nodes/)).toBeInTheDocument()
    expect(screen.getByText(/41 from neighbours/)).toBeInTheDocument()
  })

  it('a chip removes its cluster from the selection', () => {
    setOperationalView({ selectedClusters: ['cl-a', 'cl-b'] })
    render(<SelectionStrip summary={SUMMARY} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove cl-a' }))

    expect(screen.queryByText('cl-a')).not.toBeInTheDocument()
    expect(screen.getByText('cl-b')).toBeInTheDocument()
  })

  it('clears the whole selection', () => {
    setOperationalView({ selectedClusters: ['cl-a', 'cl-b'] })
    const { container } = render(<SelectionStrip summary={SUMMARY} />)

    fireEvent.click(screen.getByRole('button', { name: /Clear selection/ }))

    expect(container).toBeEmptyDOMElement()
  })
})
```

- [x] **Step 2: Run to verify both fail**

```bash
cd frontend && pnpm test ClusterPane SelectionStrip
```

Expected: FAIL — modules not found.

- [x] **Step 3: Write `ClusterPane.tsx`**

Key implementation points (compose from existing tokens only):

```tsx
export const ROW_H = 30
const OVERSCAN = 5

/** Rows to render for a scroll position: the visible window plus an overscan, clamped to [0, count]. */
export function visibleRange(scrollTop: number, viewportH: number, count: number, rowH: number) {
  const first = Math.floor(Math.max(0, scrollTop) / rowH)
  const visible = Math.ceil(viewportH / rowH)
  return {
    start: Math.max(0, Math.min(count, first - OVERSCAN)),
    end: Math.max(0, Math.min(count, first + visible + OVERSCAN)),
  }
}
```

The list body is a scroll container with a spacer div of `count * ROW_H` height and the windowed rows absolutely positioned at `index * ROW_H` — the standard no-dependency windowing shape. Track `scrollTop` in state from `onScroll`, and the container height from a `ResizeObserver` (falling back to `300` when unavailable, as jsdom has no layout).

Structure:

- **Header**: title `CLUSTERS`, a collapse button (`aria-label="Collapse cluster pane"` / `"Expand cluster pane"`, toggling `paneCollapsed` in the store), and — when the index has loaded — the totals line `1,000 clusters · 3,000 recipes · 2 days indexed` (`Intl.NumberFormat` for the thousands separators the tests assert).
- **Search**: `placeholder="Search clusters…"`, case-insensitive `includes` over `name`.
- **List**: each row is a `<label>` wrapping `<input type="checkbox" aria-label={name}>`, the name, `×{recipeCount}`, and OK/KO dot counts; plus an expand `<button aria-label={`Expand ${name}`}>` chevron.
- **Expansion**: sets `expandedCluster` in the store; `useClusterDetail(expandedCluster)` fetches lazily (its `enabled: !!name` is what makes the "no detail until expanded" test pass). Renders recipe checkboxes (checked unless in `deselectedRecipes`) and date checkboxes (checked when in `selectedDates`, or when `selectedDates` is empty).
- **Collapsed**: render only a 36px vertical strip with the expand button — mirroring Tab 2's `ExpressionDock` collapsed strip.
- **Width**: `data-testid="cluster-pane"`, `style={{ width: paneCollapsed ? 36 : paneWidth }}`, with a 4px drag handle on the right edge writing `paneWidth` (clamped 200–420) to the store on `mousemove` while dragging.

Every mutation goes through `setOperationalView`; the component holds only `scrollTop`, the search text and the drag state locally.

- [x] **Step 4: Write `SelectionStrip.tsx`**

```tsx
export interface SelectionSummary {
  recipes: number; dates: number; ok: number; ko: number; nodes: number; neighbors: number
}

export function SelectionStrip({ summary }: { summary: SelectionSummary | null }) {
  const { selectedClusters } = useOperationalView()
  if (selectedClusters.length === 0) return null
  // chips + aggregate line, "Clear selection" button
}
```

Chips: `<span>{name}</span>` plus `<button aria-label={`Remove ${name}`}>✕</button>` calling
`setOperationalView({ selectedClusters: selectedClusters.filter(c => c !== name) })`.
Aggregate line, formatted with `Intl.NumberFormat('en-US')`:
`3 clusters · 187 recipes · 14 dates · 1,842 OK · 6 KO · 312 nodes · 41 from neighbours`.
"Clear selection" sets `selectedClusters: []`.

- [x] **Step 5: Run the tests**

```bash
cd frontend && pnpm test ClusterPane SelectionStrip && pnpm exec tsc --noEmit
```

Expected: PASS, 18 tests across the two files.

- [x] **Step 6: Commit**

```bash
git add frontend/src/components/tab3/ClusterPane.tsx frontend/src/components/tab3/ClusterPane.test.tsx \
        frontend/src/components/tab3/SelectionStrip.tsx frontend/src/components/tab3/SelectionStrip.test.tsx \
        docs/superpowers/plans/2026-08-27-operational-scale.md
git commit -m "feat(tab3): cluster pane and selection strip

The pane is how a selection gets made, so it must itself scale: rows are
windowed by hand over a fixed 30px height (no dependency), and per-cluster
recipes and dates load only when a row is expanded. A test renders 1000
clusters and asserts fewer than 60 rows reach the DOM.

The strip keeps the current scope visible without opening the pane, and states
how many of the rendered nodes came from neighbouring clusters."
```

---

### Task 14: Tab 3 shell — empty state, scoped graph, staged loading

**Files:**
- Modify: `frontend/src/components/tab3/ETLOperational.tsx`
- Modify: `frontend/src/components/tab3/ETLOperational.test.tsx`
- Create: `frontend/src/components/tab3/OperationalProgress.tsx`

**Interfaces:**
- Consumes: everything from Tasks 8, 10, 12, 13.
- Produces, for Tasks 15–17: the composed shell those tasks add the density toggle, the calendar and the wheel handlers to.

**Why:** this is where the progressive load actually happens. With nothing selected, the tab must fetch **only** `/api/operational/clusters` — no graph request and no per-date fan-out (spec §11 criterion 1).

**Correction carried from the spec:** the loading panel reports **stage names and resolved totals**, never a percentage or an "N of M days" counter. The backend cannot report per-day progress without a streaming endpoint, and SSE is a non-goal (spec §2, §7.6). Do not invent a progress bar here.

- [x] **Step 1: Write the failing tests**

Add to `ETLOperational.test.tsx`. Extend the imports first —
`import { act } from '@testing-library/react'`, `import { delay } from 'msw'` (already imported in
this file), and `import { resetOperationalView, setOperationalView } from '../../state/operationalView'`
plus a `beforeEach(() => { localStorage.clear(); resetOperationalView() })` — then declare the
fixture the new cases use, next to the existing `GRAPH`/`SUMMARY`/`DATES` consts:

```tsx
const CLUSTER_INDEX = {
  mode: 'mock',
  dates: ['2026-07-28', '2026-07-29'],
  totals: { clusters: 2, recipes: 2, dates: 2, rows: 4 },
  clusters: [
    { name: 'cl-a', recipeCount: 1, dateIdx: [0, 1], rows: 2, ok: 2, ko: 0,
      lastDate: '2026-07-29', lastStatus: 'SUCCESS' },
    { name: 'cl-b', recipeCount: 1, dateIdx: [1], rows: 2, ok: 1, ko: 1,
      lastDate: '2026-07-29', lastStatus: 'FAILED' },
  ],
}
```

Add two handlers to the existing `setupServer` call: `/api/operational/clusters` returning
`CLUSTER_INDEX`, and a `/api/relationships` handler that returns the existing `GRAPH` fixture plus
one extra node flagged `neighbor: true` and named `_ETL_neighbour.json`, so the dimming assertion
has something to find. Then append the cases:

```tsx
  it('fetches only the cluster index when nothing is selected', async () => {
    const paths: string[] = []
    server.events.on('request:start', ({ request }) => paths.push(new URL(request.url).pathname))

    render(<ETLOperational />, { wrapper })
    await screen.findByText(/Select a cluster/)

    expect(paths).toContain('/api/operational/clusters')
    expect(paths).not.toContain('/api/relationships')
  })

  it('prompts for a cluster and states the corpus scale', async () => {
    render(<ETLOperational />, { wrapper })

    expect(await screen.findByText(/Select a cluster/)).toBeInTheDocument()
    expect(screen.getByText(/clusters/)).toBeInTheDocument()
  })

  it('loads the scoped graph once a cluster is selected', async () => {
    const queries: string[] = []
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url)
      if (url.pathname === '/api/relationships') queries.push(url.search)
    })

    render(<ETLOperational />, { wrapper })
    await screen.findByText(/Select a cluster/)

    act(() => setOperationalView({ selectedClusters: ['cl-a'] }))

    await waitFor(() => expect(queries).toHaveLength(1))
    expect(queries[0]).toContain('clusters=cl-a')
  })

  it('returns to the prompt when the last cluster is deselected, without refetching the index', async () => {
    let indexCalls = 0
    server.use(http.get('*/api/operational/clusters', () => {
      indexCalls++
      return HttpResponse.json(CLUSTER_INDEX)
    }))

    render(<ETLOperational />, { wrapper })
    await screen.findByText(/Select a cluster/)
    act(() => setOperationalView({ selectedClusters: ['cl-a'] }))
    await screen.findByText(/_ETL_m_CAS_T\.json/)

    act(() => setOperationalView({ selectedClusters: [] }))

    expect(await screen.findByText(/Select a cluster/)).toBeInTheDocument()
    expect(indexCalls).toBe(1)
  })

  it('dims nodes that came from a neighbouring cluster', async () => {
    render(<ETLOperational />, { wrapper })
    await screen.findByText(/Select a cluster/)
    act(() => setOperationalView({ selectedClusters: ['cl-a'] }))

    const neighbour = await screen.findByTestId('node-recipe:_ETL_neighbour.json')
    expect(Number(neighbour.style.opacity)).toBeLessThan(1)
  })

  // The spec's explicit non-goal: no percentage, no "N of M days".
  it('reports loading as named stages with resolved totals, not a percentage', async () => {
    server.use(http.get('*/api/operational/clusters', async () => {
      await delay(60)
      return HttpResponse.json(CLUSTER_INDEX)
    }))

    render(<ETLOperational />, { wrapper })

    expect(await screen.findByText(/Indexing b15 history/)).toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('still explains an empty graph with the data-root report', async () => {
    server.use(http.get('*/api/operational/clusters', () => HttpResponse.json({
      mode: 'absent', dates: [], totals: { clusters: 0, recipes: 0, dates: 0, rows: 0 }, clusters: [],
    })))

    render(<ETLOperational />, { wrapper })

    expect(await screen.findByText(/No relationship entries|No b15 history/)).toBeInTheDocument()
    expect(screen.getByText(/Data roots/i)).toBeInTheDocument()
  })
```

- [x] **Step 2: Run to verify it fails**

```bash
cd frontend && pnpm test ETLOperational
```

Expected: FAIL — the tab still calls `useRelationships()` unconditionally.

- [x] **Step 3: Write `OperationalProgress.tsx`**

```tsx
export interface ProgressStage { label: string; detail: string | null; done: boolean; active: boolean }

/**
 * Stage names and resolved totals — deliberately NOT a percentage. The backend cannot report
 * per-day indexing progress without a streaming endpoint, and inventing a bar that does not track
 * real work is worse than naming the stage honestly (spec §2, §7.6).
 */
export function OperationalProgress({ stages }: { stages: ProgressStage[] }) { /* Spinner + rows */ }
```

Each row: a `Spinner` when `active`, a `✓` when `done`, a dim dot otherwise; the label; and the
`detail` (e.g. `14 days · 21 clusters · 417 rows`, `312 nodes · 41 from neighbours`) in
`--text-muted` monospace when known, omitted when not.

- [x] **Step 4: Rebuild the `ETLOperational` shell**

```tsx
export function ETLOperational() {
  const view = useOperationalView()
  const index = useClusterIndex()
  const rel = useScopedRelationships(view.selectedClusters)     // enabled only when non-empty
  const summary = useOperationalSummary()
  const cfg = useAppConfig()
  const diagnostics = useDiagnostics()
  // ...
}
```

Replace `useRelationships()` with `useScopedRelationships(view.selectedClusters)`, and replace
every `useState` for selection/zoom/pan/date/density with reads of `view` and writes through
`setOperationalView`. Render order:

1. `index.isLoading` → `<OperationalProgress>` with stage 1 active.
2. `index.error` → the existing `ApiError` block, unchanged.
3. `index.data.totals.rows === 0` → the existing empty state **plus** `<DataRootsPanel>` — an empty
   b15 history is still never self-explanatory (ADR-0013). Keep that panel exactly as it is.
4. `view.selectedClusters.length === 0` → the pane plus a centred prompt: a `◇` glyph,
   "Select a cluster to load its graph", and the totals line from `index.data.totals`.
5. otherwise → pane, `SelectionStrip`, toolbar, `TimePicker`, graph, detail panel.

Left-dock `<ClusterPane />` inside the main flex row, before the graph.

In `RelationshipGraph`, give each card wrapper `data-testid={`node-${card.id}`}` and
`opacity: card.neighbor ? 0.45 : 1`, and add `neighbor?: boolean` to the adapter's card type,
populated from `NodeDto.neighbor` in `toOperationalGraph`.

Feed the cards their run history: `useRuns(recipeNames, 10)` over the recipe cards currently in
view, passing `runs={byRecipe[card.name] ?? []}`, `selectedRunDate={view.selectedRunDate}`,
`onSelectRun={r => setOperationalView({ selectedRunDate: r.date })}` and `config={cfg.data}` into
each `OperationalCard`. The chunking in `useRuns` is what makes this safe for a large cluster.

Replace the hand-built `loggingHref`/`monitoringHref` in the detail panel (`:368-374`) with
`buildLoggingUrl` / `buildDataprocClusterUrl` from `gcpLinks`, anchored on the selected run.

- [x] **Step 5: Run the tests**

```bash
cd frontend && pnpm test ETLOperational && pnpm exec tsc --noEmit
```

Expected: PASS — the pre-existing cases plus the 7 new ones.

- [x] **Step 6: Commit**

```bash
git add frontend/src/components/tab3/ETLOperational.tsx \
        frontend/src/components/tab3/ETLOperational.test.tsx \
        frontend/src/components/tab3/OperationalProgress.tsx \
        frontend/src/api/relationshipsAdapter.ts \
        docs/superpowers/plans/2026-08-27-operational-scale.md
git commit -m "feat(tab3): load per cluster instead of loading everything

With nothing selected the tab now fetches only the cluster index — no graph
request, no per-date fan-out — and shows a prompt naming the corpus scale.
Selecting clusters loads exactly their subgraph plus the flagged 1-hop
neighbours, rendered dimmed.

Loading reports named stages with resolved totals and no percentage: the
backend cannot report per-day progress without a streaming endpoint, and a bar
that tracks nothing is worse than an honest stage name.

An empty b15 history still shows the ADR-0013 data-root report — that case was
never self-explanatory and still is not."
```

---

### Task 15: Density with auto-refit

**Files:**
- Modify: `frontend/src/api/relationshipsAdapter.ts`
- Modify: `frontend/src/api/relationshipsAdapter.test.ts`
- Modify: `frontend/src/components/tab3/ETLOperational.tsx`
- Modify: `frontend/src/components/tab3/ETLOperational.test.tsx`

**Interfaces:**
- Consumes: `CardDensity` from `types.ts` (Task 10), `useOperationalView` (Task 12).
- Produces: `DENSITY_PITCH`, `layoutCards(cards, edges, density)`, `fitToViewport(cards, viewport, density)`.

**Why:** collapsing must genuinely fit more flow on screen, not just shrink boxes — so the layout pitch changes with the density and the view refits (spec §7.3). The implicit `compact = zoom < 0.65` at `ETLOperational.tsx:116` is **removed**: an implicit density fighting an explicit control is a bug waiting to happen. Tab 1's `EtlCanvas` zoom-collapse is untouched (Global Constraints).

- [x] **Step 1: Write the failing test**

Append to `frontend/src/api/relationshipsAdapter.test.ts`:

```ts
import { DENSITY_PITCH, fitToViewport, toOperationalGraph } from './relationshipsAdapter'

// `graph` and `summary` are the fixtures this file already declares at :10 and :37 — reuse them
// rather than adding a third, and do not shadow `graph` with a local of the same name.
describe('density layout', () => {
  const detailedView = toOperationalGraph(graph, undefined, null, 'detailed')

  it('packs tighter at each density', () => {
    const detailed = toOperationalGraph(graph, undefined, null, 'detailed')
    const compact = toOperationalGraph(graph, undefined, null, 'compact')
    const minimal = toOperationalGraph(graph, undefined, null, 'minimal')

    const span = (v: typeof detailed) => Math.max(...v.cards.map(c => (c.y ?? 0)))
    expect(span(compact)).toBeLessThan(span(detailed))
    expect(span(minimal)).toBeLessThan(span(compact))
  })

  it('keeps column order identical across densities', () => {
    const names = (d: 'detailed' | 'minimal') =>
      toOperationalGraph(graph, undefined, null, d).cards
        .slice().sort((a, b) => (a.x ?? 0) - (b.x ?? 0) || (a.y ?? 0) - (b.y ?? 0)).map(c => c.name)
    expect(names('minimal')).toEqual(names('detailed'))
  })

  it('pitches are strictly decreasing', () => {
    expect(DENSITY_PITCH.compact.row).toBeLessThan(DENSITY_PITCH.detailed.row)
    expect(DENSITY_PITCH.minimal.row).toBeLessThan(DENSITY_PITCH.compact.row)
  })
})

describe('fitToViewport', () => {
  it('scales the whole graph into the viewport and clamps at 1', () => {
    const wide = [{ ...detailedView.cards[0]!, x: 0, y: 0 }, { ...detailedView.cards[0]!, id: 'z', x: 4000, y: 2000 }]
    const fit = fitToViewport(wide, { width: 1000, height: 600 }, 'detailed')

    expect(fit.zoom).toBeGreaterThan(0.3)
    expect(fit.zoom).toBeLessThan(1)
  })

  it('never magnifies a small graph beyond 1', () => {
    const fit = fitToViewport([{ ...detailedView.cards[0]!, x: 0, y: 0 }], { width: 1000, height: 600 }, 'detailed')
    expect(fit.zoom).toBe(1)
  })

  it('clamps at the 0.3 floor for an enormous graph', () => {
    const huge = [{ ...detailedView.cards[0]!, x: 0, y: 0 }, { ...detailedView.cards[0]!, id: 'z', x: 90_000, y: 60_000 }]
    expect(fitToViewport(huge, { width: 800, height: 500 }, 'detailed').zoom).toBe(0.3)
  })

  it('returns a neutral view for an empty graph', () => {
    expect(fitToViewport([], { width: 800, height: 500 }, 'detailed')).toEqual({ zoom: 1, pan: { x: 40, y: 40 } })
  })
})
```

And to `ETLOperational.test.tsx`:

```tsx
  it('cycles density and re-lays out', async () => {
    render(<ETLOperational />, { wrapper })
    await screen.findByText(/Select a cluster/)
    act(() => setOperationalView({ selectedClusters: ['cl-a'] }))
    await screen.findByText(/_ETL_m_CAS_T\.json/)

    fireEvent.click(screen.getByRole('button', { name: /Density: detailed/ }))
    expect(await screen.findByRole('button', { name: /Density: compact/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Density: compact/ }))
    expect(await screen.findByRole('button', { name: /Density: minimal/ })).toBeInTheDocument()
  })

  it('has no implicit zoom-driven density any more', async () => {
    render(<ETLOperational />, { wrapper })
    await screen.findByText(/Select a cluster/)
    act(() => setOperationalView({ selectedClusters: ['cl-a'], zoom: 0.4, density: 'detailed' }))

    // At 0.4 the old code force-collapsed the cards; density is explicit now.
    expect(await screen.findByText('p95')).toBeInTheDocument()
  })
```

- [x] **Step 2: Run to verify it fails**

```bash
cd frontend && pnpm test relationshipsAdapter ETLOperational
```

Expected: FAIL — `toOperationalGraph` takes three arguments; `DENSITY_PITCH`/`fitToViewport` do not exist.

- [x] **Step 3: Implement**

In `relationshipsAdapter.ts`:

```ts
import type { CardDensity } from '../types'

/** Column/row pitch and card footprint per density. Replaces the module-level X0/Y0/COL_PITCH/ROW_PITCH. */
export const DENSITY_PITCH: Record<CardDensity, { col: number; row: number; width: number; height: number }> = {
  detailed: { col: 320, row: 190, width: 252, height: 150 },
  compact:  { col: 230, row: 80,  width: 200, height: 56 },
  minimal:  { col: 200, row: 36,  width: 180, height: 26 },
}

const X0 = 40, Y0 = 40

/** Fits every card into `viewport`, never magnifying past 1 and never shrinking below 0.3. */
export function fitToViewport(cards: OperationalCard[], viewport: { width: number; height: number },
    density: CardDensity): { zoom: number; pan: { x: number; y: number } } {
  if (cards.length === 0) return { zoom: 1, pan: { x: X0, y: Y0 } }
  const { width, height } = DENSITY_PITCH[density]
  const maxX = Math.max(...cards.map(c => (c.x ?? 0) + width))
  const maxY = Math.max(...cards.map(c => (c.y ?? 0) + height))
  const zoom = Math.max(0.3, Math.min(1, Math.min(viewport.width / (maxX + X0), viewport.height / (maxY + Y0))))
  return { zoom, pan: { x: X0, y: Y0 } }
}
```

`layoutCards` gains a `density: CardDensity` parameter and reads `col`/`row` from `DENSITY_PITCH[density]` in place of the constants; `toOperationalGraph` gains a fourth parameter `density: CardDensity = 'detailed'` and threads it through. The **column assignment logic is untouched** — only the pitch changes, which is what keeps column order identical across densities.

Add `neighbor?: boolean` to the adapter's card construction, read from `NodeDto.neighbor` (Task 14 already consumes it).

In `ETLOperational.tsx`:

- delete `const compact = zoom < 0.65` and every `compact ? … : …` branch, passing `density={view.density}` to `OperationalCard` instead;
- add a density button beside the zoom controls, `aria-label={`Density: ${view.density}`}`, cycling `detailed → compact → minimal → detailed`;
- on density change, recompute the layout and refit:

```tsx
  const onCycleDensity = () => {
    const next: CardDensity = view.density === 'detailed' ? 'compact'
      : view.density === 'compact' ? 'minimal' : 'detailed'
    const relaid = toOperationalGraph(rel.data!, summary.data, view.selectedDate, next)
    setOperationalView({ density: next, ...fitToViewport(relaid.cards, viewportRef.current, next) })
  }
```

where `viewportRef.current` is `{ width, height }` from a `ResizeObserver` on the graph container, defaulting to `{ width: 1200, height: 700 }` before first measure.

- [x] **Step 4: Run the tests**

```bash
cd frontend && pnpm test relationshipsAdapter ETLOperational && pnpm exec tsc --noEmit
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add frontend/src/api/relationshipsAdapter.ts frontend/src/api/relationshipsAdapter.test.ts \
        frontend/src/components/tab3/ETLOperational.tsx \
        frontend/src/components/tab3/ETLOperational.test.tsx \
        docs/superpowers/plans/2026-08-27-operational-scale.md
git commit -m "feat(tab3): three card densities that re-lay out and refit

Detailed / Compact / Minimal each pack at their own pitch and refit to the
viewport, so collapsing fits more flow on screen instead of only shrinking
boxes. Column assignment is untouched, so ordering is identical across
densities.

Removes the implicit compact = zoom < 0.65 rule: an implicit density fighting
an explicit control is a bug waiting to happen. Tab 1's canvas is unchanged."
```

---

### Task 16: Availability calendar

**Files:**
- Create: `frontend/src/components/tab3/AvailabilityCalendar.tsx`
- Create: `frontend/src/components/tab3/AvailabilityCalendar.test.tsx`
- Modify: `frontend/src/components/tab3/ETLOperational.tsx`

**Interfaces:**
- Consumes: `nearestAvailableDate` — **export** it from `ETLOperational.tsx` (it is currently module-private) rather than writing a second copy.
- Produces: `dayState(iso, available, inSelection, selected): DayState`, `monthGrid(year, month): (string|null)[]`, `<AvailabilityCalendar />`.

**Why:** the user asked to see which days b15 actually has data for. Today the `TimePicker`'s `<input type="date">` shows every day as equally valid and silently snaps to the nearest available one (spec §7.4). `TimePicker` itself is not restyled — the calendar is an additive sibling affordance.

- [x] **Step 1: Write the failing test**

Create `frontend/src/components/tab3/AvailabilityCalendar.test.tsx`:

```tsx
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AvailabilityCalendar, dayState, monthGrid } from './AvailabilityCalendar'

afterEach(cleanup)

const AVAILABLE = ['2026-07-16', '2026-07-17', '2026-07-18', '2026-07-28', '2026-07-29']
const IN_SELECTION = ['2026-07-17', '2026-07-29']

describe('dayState', () => {
  it('distinguishes all four states', () => {
    expect(dayState('2026-07-20', AVAILABLE, IN_SELECTION, '2026-07-18')).toBe('none')
    expect(dayState('2026-07-16', AVAILABLE, IN_SELECTION, '2026-07-18')).toBe('data')
    expect(dayState('2026-07-17', AVAILABLE, IN_SELECTION, '2026-07-18')).toBe('inSelection')
    expect(dayState('2026-07-18', AVAILABLE, IN_SELECTION, '2026-07-18')).toBe('selected')
  })

  it('selected wins over in-selection', () => {
    expect(dayState('2026-07-29', AVAILABLE, IN_SELECTION, '2026-07-29')).toBe('selected')
  })

  it('with no cluster selected every available day is plain data', () => {
    expect(dayState('2026-07-17', AVAILABLE, [], '2026-07-18')).toBe('data')
  })
})

describe('monthGrid', () => {
  it('pads to whole weeks and covers every day of the month', () => {
    const grid = monthGrid(2026, 6)                 // July 2026, 0-indexed month
    expect(grid.length % 7).toBe(0)
    expect(grid.filter(Boolean)).toHaveLength(31)
    expect(grid.filter(Boolean)[0]).toBe('2026-07-01')
    expect(grid.filter(Boolean).at(-1)).toBe('2026-07-31')
  })

  it('handles a February in a leap year', () => {
    expect(monthGrid(2028, 1).filter(Boolean)).toHaveLength(29)
  })
})

describe('AvailabilityCalendar', () => {
  const props = {
    availableDates: AVAILABLE, selectionDates: IN_SELECTION,
    selectedDate: '2026-07-18', onSelect: vi.fn(),
  }

  it('opens on the selected date\'s month and names it', () => {
    render(<AvailabilityCalendar {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Show calendar/ }))
    expect(screen.getByText(/July 2026/)).toBeInTheDocument()
  })

  it('labels each day with its availability state', () => {
    render(<AvailabilityCalendar {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Show calendar/ }))

    expect(screen.getByRole('button', { name: '2026-07-16, has data' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2026-07-17, has data in selection' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2026-07-18, selected' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2026-07-20, no data' })).toBeInTheDocument()
  })

  it('shows a legend for all four states', () => {
    render(<AvailabilityCalendar {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Show calendar/ }))

    expect(screen.getByText(/no data/i)).toBeInTheDocument()
    expect(screen.getByText(/in selection/i)).toBeInTheDocument()
  })

  it('emits the clicked day when it has data', () => {
    const onSelect = vi.fn()
    render(<AvailabilityCalendar {...props} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /Show calendar/ }))

    fireEvent.click(screen.getByRole('button', { name: '2026-07-29, has data in selection' }))

    expect(onSelect).toHaveBeenCalledWith('2026-07-29')
  })

  // Mirrors the backend's nearest-available rule rather than doing nothing.
  it('snaps an empty day to the nearest available date', () => {
    const onSelect = vi.fn()
    render(<AvailabilityCalendar {...props} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /Show calendar/ }))

    fireEvent.click(screen.getByRole('button', { name: '2026-07-20, no data' }))

    expect(onSelect).toHaveBeenCalledWith('2026-07-18')
  })

  it('navigates months', () => {
    render(<AvailabilityCalendar {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Show calendar/ }))

    fireEvent.click(screen.getByRole('button', { name: /Previous month/ }))
    expect(screen.getByText(/June 2026/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Next month/ }))
    expect(screen.getByText(/July 2026/)).toBeInTheDocument()
  })
})
```

- [x] **Step 2: Run to verify it fails**

```bash
cd frontend && pnpm test AvailabilityCalendar
```

Expected: FAIL — module not found.

- [x] **Step 3: Implement**

```tsx
export type DayState = 'none' | 'data' | 'inSelection' | 'selected'

export function dayState(iso: string, available: string[], inSelection: string[],
    selected: string | null): DayState {
  if (iso === selected) return 'selected'
  if (inSelection.includes(iso)) return 'inSelection'
  return available.includes(iso) ? 'data' : 'none'
}

/** ISO days of `month` padded with nulls to whole Monday-first weeks. */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1))
  const lead = (first.getUTCDay() + 6) % 7                      // Monday-first
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells: (string | null)[] = Array(lead).fill(null)
  for (let d = 1; d <= days; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}
```

Colours, from existing tokens only: `none` → `--text-dim` on `--surface`; `data` → `--text` on
`rgba(79,156,249,0.12)`; `inSelection` → `--text` on `rgba(79,156,249,0.28)`; `selected` → as
`inSelection` plus a `1px solid #4f9cf9` ring. `aria-label` is `` `${iso}, ${label}` `` with labels
`no data` / `has data` / `has data in selection` / `selected` exactly as the tests assert.

Clicking a `none` day calls `onSelect(nearestAvailableDate(iso, availableDates))`; clicking any
other day calls `onSelect(iso)`. Import `nearestAvailableDate` from `ETLOperational.tsx` — export it
there; do **not** write a second copy of that rule.

Mount `<AvailabilityCalendar>` next to `<TimePicker>` in the Tab 3 toolbar row, with
`availableDates` from `index.data.dates`, `selectionDates` derived from the selected clusters'
`dateIdx` mapped through `index.data.dates`, `selectedDate` from `view.selectedDate`, and
`onSelect={d => setOperationalView({ selectedDate: d })}`.

- [x] **Step 4: Run the tests**

```bash
cd frontend && pnpm test AvailabilityCalendar ETLOperational && pnpm exec tsc --noEmit
```

Expected: PASS, 11 new tests.

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/tab3/AvailabilityCalendar.tsx \
        frontend/src/components/tab3/AvailabilityCalendar.test.tsx \
        frontend/src/components/tab3/ETLOperational.tsx \
        docs/superpowers/plans/2026-08-27-operational-scale.md
git commit -m "feat(tab3): calendar showing which days b15 actually has

Four day states — no data, has data, has data in the selected clusters,
selected — with a legend, so the days with history are visible instead of being
discovered by clicking. An empty day snaps to the nearest available date,
reusing the existing client mirror of the backend rule rather than a second
copy. TimePicker is untouched; the calendar is an additive sibling."
```

---

### Task 17: Modifier-key canvas gestures

**Files:**
- Create: `frontend/src/components/tab3/canvasGestures.ts`
- Create: `frontend/src/components/tab3/canvasGestures.test.ts`
- Modify: `frontend/src/components/tab3/ETLOperational.tsx`

**Interfaces:**
- Produces: `interface CanvasView { zoom: number; pan: { x: number; y: number } }`, `interface WheelInput { deltaX, deltaY, metaKey, ctrlKey, shiftKey, cursor: { x, y } }`, `applyWheel(view, input): CanvasView`, `wheelActs(input): boolean`.

**Why:** Tab 3's wheel handler is `e.stopPropagation()` and nothing else (`ETLOperational.tsx:128`) — the wheel does not zoom, pan, or anything. The math lives in a pure function so it is testable without synthesising DOM wheel events (spec §7.5).

- [x] **Step 1: Write the failing test**

Create `frontend/src/components/tab3/canvasGestures.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applyWheel, wheelActs, type CanvasView } from './canvasGestures'

const VIEW: CanvasView = { zoom: 1, pan: { x: 100, y: 50 } }
const input = (over: Partial<Parameters<typeof applyWheel>[1]> = {}) => ({
  deltaX: 0, deltaY: 0, metaKey: false, ctrlKey: false, shiftKey: false,
  cursor: { x: 400, y: 300 }, ...over,
})

describe('applyWheel', () => {
  it('cmd+wheel zooms in on scroll up and out on scroll down', () => {
    expect(applyWheel(VIEW, input({ metaKey: true, deltaY: -100 })).zoom).toBeGreaterThan(1)
    expect(applyWheel(VIEW, input({ metaKey: true, deltaY: 100 })).zoom).toBeLessThan(1)
  })

  it('ctrl+wheel zooms too — that is what a trackpad pinch sends', () => {
    expect(applyWheel(VIEW, input({ ctrlKey: true, deltaY: -100 })).zoom).toBeGreaterThan(1)
  })

  // The point of cursor-anchored zoom: the graph point under the pointer must not move.
  it('keeps the point under the cursor fixed while zooming', () => {
    const before = VIEW
    const after = applyWheel(before, input({ metaKey: true, deltaY: -120 }))

    const graphXBefore = (400 - before.pan.x) / before.zoom
    const graphXAfter = (400 - after.pan.x) / after.zoom
    expect(graphXAfter).toBeCloseTo(graphXBefore, 6)

    const graphYBefore = (300 - before.pan.y) / before.zoom
    const graphYAfter = (300 - after.pan.y) / after.zoom
    expect(graphYAfter).toBeCloseTo(graphYBefore, 6)
  })

  it('clamps zoom to [0.2, 2]', () => {
    let view = VIEW
    for (let i = 0; i < 200; i++) view = applyWheel(view, input({ metaKey: true, deltaY: -300 }))
    expect(view.zoom).toBe(2)

    view = VIEW
    for (let i = 0; i < 200; i++) view = applyWheel(view, input({ metaKey: true, deltaY: 300 }))
    expect(view.zoom).toBe(0.2)
  })

  it('shift+wheel pans horizontally and leaves zoom and y alone', () => {
    const after = applyWheel(VIEW, input({ shiftKey: true, deltaY: 120 }))
    expect(after.pan.x).toBe(VIEW.pan.x - 120)
    expect(after.pan.y).toBe(VIEW.pan.y)
    expect(after.zoom).toBe(1)
  })

  it('a plain wheel pans vertically', () => {
    const after = applyWheel(VIEW, input({ deltaY: 120 }))
    expect(after.pan.y).toBe(VIEW.pan.y - 120)
    expect(after.pan.x).toBe(VIEW.pan.x)
    expect(after.zoom).toBe(1)
  })

  it('honours a horizontal wheel with no modifier', () => {
    expect(applyWheel(VIEW, input({ deltaX: 60 })).pan.x).toBe(VIEW.pan.x - 60)
  })
})

describe('wheelActs', () => {
  it('is true for every gesture the canvas handles, so preventDefault is never gratuitous', () => {
    expect(wheelActs(input({ metaKey: true, deltaY: -1 }))).toBe(true)
    expect(wheelActs(input({ shiftKey: true, deltaY: 1 }))).toBe(true)
    expect(wheelActs(input({ deltaY: 1 }))).toBe(true)
    expect(wheelActs(input())).toBe(false)          // no delta at all
  })
})
```

- [x] **Step 2: Run to verify it fails**

```bash
cd frontend && pnpm test canvasGestures
```

Expected: FAIL — module not found.

- [x] **Step 3: Implement**

```ts
export interface CanvasView { zoom: number; pan: { x: number; y: number } }

export interface WheelInput {
  deltaX: number
  deltaY: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  /** Pointer position relative to the canvas container's top-left, in screen pixels. */
  cursor: { x: number; y: number }
}

const MIN_ZOOM = 0.2
const MAX_ZOOM = 2
const ZOOM_RATE = 0.002

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** True when the canvas will act on this wheel event — the only case that should preventDefault. */
export function wheelActs(input: WheelInput): boolean {
  return input.deltaX !== 0 || input.deltaY !== 0
}

/**
 * cmd/ctrl+wheel zooms about the cursor, shift+wheel pans horizontally, a plain wheel pans
 * vertically. Trackpad pinch arrives as ctrl+wheel, so pinch zoom works with no extra handling.
 *
 * Cursor-anchored zoom: the graph coordinate under the pointer is `(cursor - pan) / zoom`, and the
 * pan is corrected so that value is unchanged after the scale.
 */
export function applyWheel(view: CanvasView, input: WheelInput): CanvasView {
  if (input.metaKey || input.ctrlKey) {
    const zoom = clamp(view.zoom * Math.exp(-input.deltaY * ZOOM_RATE), MIN_ZOOM, MAX_ZOOM)
    const k = zoom / view.zoom
    return {
      zoom,
      pan: {
        x: input.cursor.x - k * (input.cursor.x - view.pan.x),
        y: input.cursor.y - k * (input.cursor.y - view.pan.y),
      },
    }
  }
  if (input.shiftKey) {
    return { zoom: view.zoom, pan: { x: view.pan.x - (input.deltaY || input.deltaX), y: view.pan.y } }
  }
  return {
    zoom: view.zoom,
    pan: { x: view.pan.x - input.deltaX, y: view.pan.y - input.deltaY },
  }
}
```

In `ETLOperational.tsx`'s `RelationshipGraph`, replace the `onWheel` handler:

```tsx
  const containerRef = useRef<HTMLDivElement>(null)

  const onWheel = useCallback((e: React.WheelEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    const input = {
      deltaX: e.deltaX, deltaY: e.deltaY,
      metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey,
      cursor: { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) },
    }
    if (!wheelActs(input)) return
    e.preventDefault()
    e.stopPropagation()
    const next = applyWheel({ zoom, pan }, input)
    setOperationalView({ zoom: next.zoom, pan: next.pan })
  }, [zoom, pan])
```

and attach `ref={containerRef}` to the container that already carries `onWheel`. `pan` moves out of
local state and into the store (Task 12) so it survives a tab switch like everything else.

Add a one-line hint to the zoom controls' tooltip: `⌘/Ctrl + wheel to zoom · Shift + wheel to pan`.

- [x] **Step 4: Run the tests**

```bash
cd frontend && pnpm test canvasGestures ETLOperational && pnpm exec tsc --noEmit
```

Expected: PASS, 8 new tests.

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/tab3/canvasGestures.ts \
        frontend/src/components/tab3/canvasGestures.test.ts \
        frontend/src/components/tab3/ETLOperational.tsx \
        docs/superpowers/plans/2026-08-27-operational-scale.md
git commit -m "feat(tab3): cmd+wheel zoom about the cursor, shift+wheel pan

Tab 3's wheel handler did nothing but stopPropagation. The math is a pure
function so cursor-anchored zoom is tested by asserting the graph coordinate
under the pointer is unchanged, rather than by synthesising DOM events.
Trackpad pinch arrives as ctrl+wheel, so it works with no extra handling."
```

---

# Part 4 — Gates, docs, acceptance

### Task 18: Sweep the new endpoints, write the ADRs, update the docs

**Files:**
- Modify: `scripts/validate_loop.sh`
- Create: `docs/adr/0014-b15-cluster-index.md`
- Create: `docs/adr/0015-gcp-deep-links.md`
- Modify: `docs/architecture.md`
- Modify: `HOW_TO_RUN_ON_YOUR_DATA.md`

**Interfaces:** none — this task adds no code paths, only gates and prose.

**Why:** `CLAUDE.md` requires `HOW_TO_RUN_ON_YOUR_DATA.md` to be updated in the *same commit* as any change to the files its derivation table names. This sub-project changed three of them — `OperationalService`, `Etl360Properties`, `scripts/dev.sh` — so these doc updates are part of the work, not follow-ups (spec §14).

- [ ] **Step 1: Add the endpoint sweep to `validate_loop.sh`**

After the existing `curl -sf localhost:8080/api/operational/2026-07-29` line, insert:

```bash
echo "[validate-loop] cluster index…"
CLUSTERS=$(curl -sf localhost:8080/api/operational/clusters) || fail "clusters"
echo "$CLUSTERS" | python3 -c '
import json, sys
d = json.load(sys.stdin)
t = d["totals"]
by_count = sorted((c["recipeCount"] for c in d["clusters"]), reverse=True)
print(f"[validate-loop] b15 index: {t["clusters"]} clusters, {t["recipes"]} recipes, "
      f"{t["dates"]} dates, {t["rows"]} rows; largest cluster {by_count[0]} recipes")
# Floors from the committed mock (spec section 8). A drop here means the CAS b15 block was
# regenerated from a changed manifest, or a data root flipped away from the committed mock.
assert t["clusters"] == 21, f"expected 21 clusters, got {t["clusters"]}"
assert t["recipes"] == 30, f"expected 30 recipes, got {t["recipes"]}"
assert t["dates"] == 14, f"expected 14 dates, got {t["dates"]}"
assert t["rows"] == 417, f"expected 417 rows, got {t["rows"]}"
# The whole point of the multi-recipe regrouping: without this the pane is untested.
assert by_count[0] >= 4, f"no cluster groups 4+ recipes (largest {by_count[0]})"
' || fail "cluster index floors"

FIRST_CLUSTER=$(echo "$CLUSTERS" | python3 -c 'import json,sys; print(json.load(sys.stdin)["clusters"][0]["name"])')
curl -sf "localhost:8080/api/operational/clusters/$FIRST_CLUSTER" | grep -q '"recipes"' || fail "cluster detail"
curl -s -o /dev/null -w '%{http_code}' localhost:8080/api/operational/clusters/no-such-cluster | grep -q 404 \
  || fail "unknown-cluster 404"

echo "[validate-loop] runs…"
RECIPE=$(curl -sf "localhost:8080/api/operational/clusters/$FIRST_CLUSTER" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["recipes"][0]["recipeFilename"])')
curl -sf "localhost:8080/api/operational/runs?recipe=$RECIPE&limit=10" | python3 -c '
import json, sys
runs = next(iter(json.load(sys.stdin)["byRecipe"].values()))
assert runs, "no runs for the first recipe of the first cluster"
assert runs[0]["date"] >= runs[-1]["date"], "runs are not newest-first"
# app_start_iso is what the Cloud Logging cursorTimestamp is derived from — no cursor without it.
assert runs[0]["appStartIso"], "run carries no appStartIso"
assert runs[0]["jobId"], "run carries no jobId"
' || fail "runs shape"

echo "[validate-loop] scoped relationships…"
FULL_NODES=$(curl -sf localhost:8080/api/relationships | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["nodes"]))')
curl -sf "localhost:8080/api/relationships?clusters=$FIRST_CLUSTER" | python3 -c "
import json, sys
g = json.load(sys.stdin)
nodes = g['nodes']
assert 0 < len(nodes) < $FULL_NODES, f'scoped graph is not a strict subset: {len(nodes)} vs $FULL_NODES'
assert g['meta']['neighborCount'] == sum(1 for n in nodes if n.get('neighbor')), 'neighborCount mismatch'
print(f\"[validate-loop] scoped graph: {len(nodes)} nodes ({g['meta']['neighborCount']} neighbours) of $FULL_NODES\")
" || fail "scoped relationships"
# The unscoped response must stay byte-identical for every existing caller.
curl -sf localhost:8080/api/relationships | grep -q 'neighbor' && fail "unscoped graph leaked scoping fields"
```

- [ ] **Step 2: Run the gate**

```bash
make validate-loop
```

Expected: `[validate-loop] PASS`, with the new lines printing `21 clusters, 30 recipes, 14 dates, 417 rows; largest cluster 5 recipes` and a scoped-graph node count strictly below the full one.

- [ ] **Step 3: Write ADR-0014**

Create `docs/adr/0014-b15-cluster-index.md` from `docs/adr/0000-template.md`, deciding:

- **Context:** a real export is ~7 000 recipes and ~5 000 tables; `/api/relationships` had no scope parameter, `summary()` re-parsed the whole b15 history per request, and Tab 4 fetched every date.
- **Decision:** one fingerprint-invalidated index over all dates; scope the *existing* relationships endpoint with `?clusters=`; include 1-hop neighbours, flagged rather than filtered.
- **Consequences / alternatives rejected:**
  - *TTL cache* — wrong in both directions on a live working directory; the repo's mtime idiom already exists (`DomService`).
  - *A separate `/api/graph/scoped` endpoint* — would fork the graph builder and leave two code paths to keep consistent; scoping the existing one keeps the unscoped bytes provably unchanged instead.
  - *Strict cluster scope with no neighbours* — an upstream failure in another cluster becomes invisible, which is the main thing an operator is looking for.
  - *Full transitive upstream* — drags in a large slice of the graph for deeply-chained clusters, defeating the purpose.
  - *Per-cluster ISO date lists* — ~115k duplicated strings at real scale; indices into one global axis instead.
  - **Cost:** the first request after any b15 change pays an O(total rows) walk.

- [ ] **Step 4: Write ADR-0015**

Create `docs/adr/0015-gcp-deep-links.md`, deciding:

- **Context:** `app_id` and `job_id` carried the same value; `OperationalCard` built console URLs from hardcoded bases, producing a logging URL the console rejects with "Failed to load default log scope".
- **Decision:** exactly one link builder reading served templates; `app_id` removed rather than repaired; `{cursorTimestamp}`/`{duration}` added to the configurable template; one shared `RunPicker` decides which execution the links open.
- **Consequences:** two encoding rules are load-bearing and must not be "simplified" away —
  1. **matrix-safe encoding**: `;key=value` path-matrix segments must keep literal colons; blanket `encodeURIComponent` emits `%3A` and the console does not accept it;
  2. **empty-segment collapse**: an unfilled `;cursorTimestamp=` must be removed, not emitted bare, so the link degrades to the job-id-only query that works.
  Both are unit-tested in `gcpLinks.test.ts`. Note explicitly that **no real project id, job id, cluster name or timestamp appears anywhere** — only placeholder templates.

- [ ] **Step 5: Update `docs/architecture.md`**

Add to the endpoint table:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/operational/clusters` | b15 cluster index: totals, global date axis, per-cluster counts |
| GET | `/api/operational/clusters/{name}` | one cluster's recipes with per-recipe dates and OK/KO |
| GET | `/api/operational/runs` | run history by recipe, newest-first (`?recipe=` repeatable, ≤200; `?limit=` ≤50) |

and document the new `clusters` query parameter on the existing `/api/relationships` row. Add a
short paragraph after the caching paragraph noting that `B15Reader` and `ClusterIndexService` extend
the same mtime/fingerprint idiom to the b15 corpus.

- [ ] **Step 6: Update `HOW_TO_RUN_ON_YOUR_DATA.md`**

- **§2** — add the `gcpLoggingDuration` field (default `P31D`, env `ETL360_GCP_LOGGING_DURATION`) to the config-field table.
- **§3.2** — note that b15 files are now indexed by `cluster_name` as well as read per date, and that `cluster_name` is the key Tab 3 loads by, so an export whose cluster names are unstable across days will produce one pane row per run.
- **§5** — add `curl localhost:8080/api/operational/clusters` to the verification steps, with the expected shape and the note that `totals.rows == 0` means the composer root resolved but held no b15 CSVs.
- **Derivation table** — no new rows are needed; `§2` already cites `Etl360Properties`/`dev.sh` and `§3.2` cites `OperationalService`. Confirm those three citations still name the right files after this sub-project (they do: `OperationalService` still owns snapshot/summary semantics).

- [ ] **Step 7: Commit**

```bash
git add scripts/validate_loop.sh docs/adr/0014-b15-cluster-index.md \
        docs/adr/0015-gcp-deep-links.md docs/architecture.md HOW_TO_RUN_ON_YOUR_DATA.md \
        docs/superpowers/plans/2026-08-27-operational-scale.md
git commit -m "docs+gate: cluster index floors in validate-loop, ADR-0014/0015, doc refresh

validate-loop now asserts 21 clusters / 30 recipes / 14 dates / 417 rows, that
some cluster groups 4+ recipes (without which the pane is untested), that the
scoped graph is a strict subset with a consistent neighborCount, and that the
unscoped response still leaks none of the scoping fields.

HOW_TO_RUN_ON_YOUR_DATA.md moves in the same commit as the three files its
derivation table names — OperationalService, Etl360Properties, scripts/dev.sh."
```

---

### Task 19: Browser acceptance walk and final gates

**Files:**
- Create: `docs/img/*.png` (screenshots)
- Modify: `docs/visual-guide.md`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-08-27-operational-scale-design.md` (acceptance results section)

**Why:** the deterministic gates prove the mechanisms; they do not prove the rendered result. This pass observes it (spec §10, user decision), and fills the seven screenshots `docs/visual-guide.md`'s capture checklist has been waiting on — which also closes the Tab 2 visual sign-off recorded in `CLAUDE.md`.

- [ ] **Step 1: Run every deterministic gate from clean**

```bash
mvn -q -am -pl backend clean test
grep -h "^Tests run:" backend/target/surefire-reports/*.txt \
  | awk -F'[ ,]+' '{t+=$3; f+=$5; e+=$7} END {print "backend tests="t, "failures="f, "errors="e}'
echo "reports=$(ls backend/target/surefire-reports/*.txt | wc -l) testfiles=$(find backend/src/test/java -name '*Test.java' | wc -l)"
cd frontend && pnpm test && pnpm exec tsc --noEmit && cd ..
make validate-loop
```

Record the real numbers. Baselines were backend **212** / frontend **428**; report the actual totals rather than a predicted one, and confirm `reports == testfiles`.

- [ ] **Step 2: Boot the app**

```bash
make dev    # backend :8080, frontend :8443
```

- [ ] **Step 3: Walk the acceptance criteria in Chrome**

Load `http://localhost:8443`, open Tab 3, and check each of spec §11's fifteen criteria. Use the
Chrome extension's console reader after each group and record any error or warning. For criterion
11 — the one that cannot be asserted in a unit test — copy the Logging link's `href`, confirm it
carries `query=resource.labels.job_id`, a literal-colon `;cursorTimestamp=`, and `;duration=`, then
open it and confirm the console does **not** show "Failed to load default log scope".

> **Do not paste a real job id, project id, cluster name or resolved URL into the plan, the spec,
> a commit message, a screenshot caption, or any file.** Record criterion 11 as pass/fail plus the
> *shape* observed. If a screenshot would capture a real identifier, retake it against the
> committed mock tier (`ETL360_DWH_CONTROL_ROOT`/`ETL360_COMPOSER_ROOT` pinned to
> `backend/src/main/resources/mock/...`, as `validate_loop.sh` does).

- [ ] **Step 4: Capture the screenshots**

Follow `docs/visual-guide.md`'s existing checklist (window ~1440×900,
`screencapture -x -o docs/img/<file>.png`). Capture its seven pending images plus four new ones:

| File | State |
|---|---|
| `tab3-empty-prompt.png` | Tab 3, no cluster selected — pane open, prompt and totals visible |
| `tab3-cluster-selected.png` | one cluster selected — scoped graph with dimmed neighbours, selection strip |
| `tab3-density-minimal.png` | same selection at Minimal density, refitted |
| `tab3-calendar.png` | calendar open, all four day states visible |

Then verify and add the new figures to `docs/visual-guide.md` alongside its existing `![...]` links:

```bash
file docs/img/*.png && du -sh docs/img
```

Expected: every file reports "PNG image data"; the directory stays under ~3 MB.

- [ ] **Step 5: Record the results in the spec**

Append an `## Acceptance walk — results (Task 19, 2026-08-27)` section to
`docs/superpowers/specs/2026-08-27-operational-scale-design.md`: one line per criterion with
PASS/FAIL and, for anything that failed, what was observed. Follow the format of sub-project 9's
"Acceptance walk — results" section. Any FAIL becomes a fix commit in this branch, not a follow-up.

- [ ] **Step 6: Update `CLAUDE.md`**

- Tab 3's description: cluster-scoped loading, three densities, calendar, wheel gestures, cached view state.
- Testing section: the new floors (21 clusters / 30 recipes / 14 dates / 417 rows) and the three new endpoints in the `validate-loop` list.
- Corpus caveats: `cluster_name` is a b15 fact and `workflow` is an L2L fact — they are deliberately unrelated, and the CAS mock groups clusters *across* workflows to keep them from being conflated.
- ADR range → `0001`–`0015`.
- Current spec/plan pointers → this sub-project's spec and plan.
- Replace the "pending human visual sign-off" note with what Task 19 actually observed.

- [ ] **Step 7: Final commit**

```bash
git add docs/img docs/visual-guide.md CLAUDE.md \
        docs/superpowers/specs/2026-08-27-operational-scale-design.md \
        docs/superpowers/plans/2026-08-27-operational-scale.md
git commit -m "docs: acceptance walk results, screenshots, CLAUDE.md refresh

Fifteen acceptance criteria walked in Chrome against the committed mock tier,
including the one no unit test can cover: that the Logging link opens the
console scoped to the selected run without 'Failed to load default log scope'.
Screenshots captured against mock data only — no real identifier is recorded
anywhere in the repo."
```

- [ ] **Step 8: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill. Do not merge before every checkbox in
this plan is ticked, every gate is green from a clean build, and the acceptance results section
records an outcome for all fifteen criteria.

---

## Critical Files for Implementation

Read these before starting; they carry the conventions every task must follow.

| File | Why it matters |
|---|---|
| `backend/.../service/OperationalService.java` | The b15 semantics being preserved: status literals, duration parsing, nearest-available rule. Tasks 2–5 must not move any of them. |
| `backend/.../service/DomService.java` | The mtime-cache idiom `B15Reader` copies. |
| `backend/.../service/RelationshipService.java` | Its class comment explains the whole-graph-metadata ordering hazard scoping must not reintroduce (Task 6). |
| `backend/.../config/Etl360Properties.java` | The `@ConstructorBinding` + convenience-arity pattern `Gcp.loggingDuration` copies (Task 7). |
| `backend/.../api/DiagnosticsControllerTest.java` | The contract-test shape (`@SpringBootTest` + MockMvc + jsonPath) Tasks 4–6 follow. |
| `frontend/src/components/tab3/ETLOperational.test.tsx` | The MSW fixture idiom every frontend test here follows. |
| `frontend/src/components/tab2/useResizableLayout.ts` | The resize + `localStorage` persistence idiom `ClusterPane` copies (Task 13). |
| `frontend/src/components/tab2/ExpressionDock.tsx` | Sub-project 9's bounded-render fix — the same class of problem `ClusterPane` avoids by windowing. |
| `frontend/src/index.css` | The token set. No new token may be added. |
| `scripts/mock_etl_data.mts` | `b15.cluster` lives in the manifest at `:27`; `--emit b15` is the only sanctioned way to change a CAS row (Task 1). |
| `docs/adr/0013-data-root-diagnostics.md` | Why an empty Tab 3 must still explain itself — Task 14 must keep `DataRootsPanel` in the empty state. |
| `docs/harness.md` | The per-task loop, the gates, and how they compose. |

## Ledger

Tick each `- [ ]` as its step completes and stage this file in the same commit as the task's
changes. The commit history is the resumability record (`CLAUDE.md`, working practices).
