# Tab 3 Operational Clarity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix eight defects that a real IPC export exposed in Tab 3 (ETL Operational) — card overlap, a silent `FAILURE`→PENDING data bug, lost navigation context, and an unsearchable corpus — so the tab shows what the data actually says.

**Architecture:** Backend first (the `FAILURE` normalizer and the search endpoint are data contracts the GUI depends on), then the pure frontend adapter/layout layer, then components, then gates and docs. The layout fix replaces a hand-maintained pitch table with a footprint table the pitch is *derived* from, so the class of bug cannot recur. Colour becomes one module that every Tab 3 surface reads.

**Tech Stack:** Spring Boot 3.3 / Java 17 (backend), React 19 / TypeScript / Vite (frontend), JUnit 5 + `mvn -am -pl backend test`, Vitest + Testing Library, `make validate-loop`.

**Spec:** `docs/superpowers/specs/2026-08-29-operational-clarity-design.md`

## Global Constraints

- **Never `git add -A`.** Stage explicit paths only — the working tree carries user-local untracked files (`_layout_*.json` sidecars, `scripts/dev`, `.claude/settings.json`).
- **No corpus file changes.** `parser/src/main/resources/xmltobq/**` and `backend/src/main/resources/mock/**` are untouched by every task in this plan. `m_CAS_*` data is manifest-generated and frozen.
- **No committed mock floor moves.** `make validate-loop` must still assert `21 clusters · 30 recipes · 14 dates · 417 rows` and readiness `81 XML · 86 recipes · 212 DDL` / `22` workflows, unchanged.
- **No parser change.** Nothing in `parser/` is touched.
- **Restyle is Tab 3-scoped.** ADR-0005's visual contract is amended for Tab 3's operational cards, toolbar chips and selection strip only. Tabs 1/2/4 render byte-identically.
- **Canonical b15 status tokens stay `SUCCESS` / `FAILED` / `""`** — the wire shape, OpenAPI schema and frontend `STATUS_MAP` contract do not change.
- **Layer palette:** `STG`,`ODS` → bronze `#b0764a`; `DWH`,`ETL` → silver `#9aa6b8`; `CDM`,`QDM`,`RDM` → gold `#d4a537`; `OUTPUT` → platinum `#cfd8e6`; `UNKNOWN` → grey `#4a5570`.
- **Kind palette:** `table` → BigQuery blue `#4f9cf9`, status bar on the **top** edge; `recipe` → Spark orange `#fb923c`, status bar on the **left** edge.
- **Density footprints:** detailed `260×280`, compact `240×56`, minimal `210×26`. **Gutters:** detailed `80×50`, compact `60×40`, minimal `40×20`.
- **Tick this plan's checkboxes and stage this file in each task's commit** — the commit history is the resumability record.
- Verify frontend with `cd frontend && pnpm test && npx tsc --noEmit`; backend with `mvn -q -am -pl backend test`.

---

## File Structure

**Backend — create:**
| Path | Responsibility |
|---|---|
| `backend/src/main/java/io/pure360/etl360/service/support/B15Status.java` | The only place a raw b15 status token is canonicalised |
| `backend/src/main/java/io/pure360/etl360/api/dto/SearchHitsDto.java` | Search response shape |
| `backend/src/test/resources/mock-status-dialect/b15_application_end_with_recipe_null_status.csv` | Test-only fixture carrying `FAILURE` |
| `backend/src/test/java/io/pure360/etl360/service/B15StatusTest.java` | Normalizer unit tests |
| `backend/src/test/java/io/pure360/etl360/api/OperationalSearchContractTest.java` | Search endpoint contract |

**Backend — modify:**
| Path | Change |
|---|---|
| `config/Etl360Properties.java` | Nested `B15` record: `statusOk`, `statusKo` |
| `service/B15Reader.java:141` | Canonicalise at parse; count unrecognized |
| `service/DiagnosticsService.java` | Report `unrecognizedStatuses` |
| `api/ClusterController.java` | Add `GET /api/operational/search` |

**Frontend — create:**
| Path | Responsibility |
|---|---|
| `frontend/src/theme/semanticColors.ts` | The only layer/kind/status → colour map |
| `frontend/src/theme/semanticColors.test.ts` | Totality + disjointness tests |
| `frontend/src/components/tab3/RelatedOverlay.tsx` | Shared by the in-app window and the `?related=` tab |
| `frontend/src/components/tab3/RelatedOverlay.test.tsx` | Overlay tests |
| `frontend/src/components/tab3/OperationalSearch.tsx` | Global-search results panel |
| `frontend/src/components/tab3/OperationalSearch.test.tsx` | Search panel tests |

**Frontend — modify:**
| Path | Change |
|---|---|
| `src/index.css` | New palette custom properties |
| `src/api/relationshipsAdapter.ts:32-36,51,136` | Footprint table, derived pitch |
| `src/api/queries.ts` | `useOperationalSearch` hook |
| `src/state/operationalView.ts` | `timeViewCollapsed`, `nodeHistory`, `historyIndex` |
| `src/components/shared/OperationalCard.tsx` | Kind/layer/status palette, edge geometry |
| `src/components/tab3/ETLOperational.tsx` | Footprint width, summary gating, time-view collapse, history controls, search wiring |
| `src/components/tab3/SelectionStrip.tsx:46,59` | Shorter, legible |
| `src/App.tsx:269` | Pass `searchQuery`; read `?related=` |

**Docs:** ADRs `0017`/`0018`/`0019`, `docs/architecture.md`, `HOW_TO_RUN_ON_YOUR_DATA.md`, `scripts/validate_loop.sh`, `config.example.json`, `scripts/dev.sh`, root `CLAUDE.md`.

---

## Task 1: b15 status normalizer

Defect 7, the critical one. Backend-only, no wire change.

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/service/support/B15Status.java`
- Create: `backend/src/test/java/io/pure360/etl360/service/B15StatusTest.java`
- Modify: `backend/src/main/java/io/pure360/etl360/config/Etl360Properties.java`

**Interfaces:**
- Produces: `B15Status.of(List<String> ok, List<String> ko)` → instance; `String canonical(String raw)` returning `"SUCCESS"`, `"FAILED"` or `""`; `B15Status.DEFAULT`. Also `Etl360Properties.B15` record with `statusOk()`, `statusKo()`, `B15.DEFAULTS`.
- Consumed by: Task 2 (`B15Reader`), Task 3 (`DiagnosticsService`).

- [x] **Step 1: Write the failing test**

```java
package io.pure360.etl360.service;

import io.pure360.etl360.service.support.B15Status;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class B15StatusTest {

    @Test
    void canonicalisesTheRealExportsFailureToken() {
        // The defect: a real export writes FAILURE, which matched no literal in the
        // codebase, so a failed run rendered as "never ran".
        assertThat(B15Status.DEFAULT.canonical("FAILURE")).isEqualTo("FAILED");
    }

    @Test
    void acceptsTheSynonymsOfBothOutcomes() {
        for (String ok : List.of("SUCCESS", "SUCCEEDED", "OK", "COMPLETED", "DONE")) {
            assertThat(B15Status.DEFAULT.canonical(ok)).as(ok).isEqualTo("SUCCESS");
        }
        for (String ko : List.of("FAILURE", "FAILED", "ERROR", "KILLED", "ABORTED", "CANCELLED")) {
            assertThat(B15Status.DEFAULT.canonical(ko)).as(ko).isEqualTo("FAILED");
        }
    }

    @Test
    void matchesCaseInsensitivelyAndTrims() {
        assertThat(B15Status.DEFAULT.canonical("  failure ")).isEqualTo("FAILED");
        assertThat(B15Status.DEFAULT.canonical("Success")).isEqualTo("SUCCESS");
    }

    @Test
    void mapsBlankAndUnknownToTheEmptyToken() {
        assertThat(B15Status.DEFAULT.canonical("")).isEmpty();
        assertThat(B15Status.DEFAULT.canonical(null)).isEmpty();
        assertThat(B15Status.DEFAULT.canonical("SKIPPED")).isEmpty();
    }

    @Test
    void reportsUnrecognizedTokensInsteadOfSwallowingThem() {
        B15Status s = B15Status.of(List.of("SUCCESS"), List.of("FAILED"));
        s.canonical("SKIPPED");
        s.canonical("skipped");
        s.canonical("SUCCESS");
        // Reported under the ORIGINAL spelling of the first sighting, counted case-insensitively.
        assertThat(s.unrecognized()).containsExactly(java.util.Map.entry("SKIPPED", 2L));
    }

    @Test
    void configuredVocabularyReplacesTheDefault() {
        B15Status s = B15Status.of(List.of("GOOD"), List.of("BAD"));
        assertThat(s.canonical("GOOD")).isEqualTo("SUCCESS");
        assertThat(s.canonical("BAD")).isEqualTo("FAILED");
        assertThat(s.canonical("SUCCESS")).isEmpty();   // no longer in the vocabulary
    }
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `mvn -q -am -pl backend test -Dtest=B15StatusTest`
Expected: compilation failure — `package io.pure360.etl360.service.support` does not contain `B15Status`.

- [x] **Step 3: Write the normalizer**

```java
package io.pure360.etl360.service.support;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.LongAdder;
import java.util.stream.Collectors;

/**
 * Canonicalises the b15 {@code status} column.
 *
 * <p>The column's vocabulary is <b>export-specific</b>, not IPC law: this repo's anonymized
 * sample data writes {@code SUCCESS}/{@code FAILED}, while a real Composer export writes
 * {@code FAILURE}. Until this class existed, that token matched no literal anywhere in the
 * stack, so a FAILED run rendered as PENDING — "never ran" — which is the most misleading
 * state Tab 3 can show. Same class of trap as the ADR-0013 anchor table.
 *
 * <p>Canonical output is deliberately today's vocabulary ({@code SUCCESS}/{@code FAILED}/{@code ""}),
 * so every downstream consumer keeps comparing two literals and needs no change.
 */
public final class B15Status {
    public static final String OK = "SUCCESS";
    public static final String KO = "FAILED";
    public static final String UNKNOWN = "";

    public static final List<String> DEFAULT_OK = List.of("SUCCESS", "SUCCEEDED", "OK", "COMPLETED", "DONE");
    /** KILLED/ABORTED/CANCELLED default here because to an operator they are emphatically not
     * successes, and a non-success rendering as PENDING is the exact defect this class fixes. */
    public static final List<String> DEFAULT_KO = List.of("FAILURE", "FAILED", "ERROR", "KILLED", "ABORTED", "CANCELLED");

    public static final B15Status DEFAULT = of(DEFAULT_OK, DEFAULT_KO);

    private final Set<String> ok;
    private final Set<String> ko;
    private final Map<String, LongAdder> unrecognized = new ConcurrentHashMap<>();

    private B15Status(Set<String> ok, Set<String> ko) {
        this.ok = ok;
        this.ko = ko;
    }

    public static B15Status of(List<String> ok, List<String> ko) {
        return new B15Status(normalizeAll(ok), normalizeAll(ko));
    }

    private static Set<String> normalizeAll(List<String> tokens) {
        return tokens.stream().map(B15Status::key).filter(s -> !s.isEmpty()).collect(Collectors.toUnmodifiableSet());
    }

    private static String key(String raw) {
        return raw == null ? "" : raw.trim().toUpperCase(java.util.Locale.ROOT);
    }

    /** {@code SUCCESS}, {@code FAILED}, or {@code ""} for blank AND for anything unrecognized. */
    public String canonical(String raw) {
        String k = key(raw);
        if (k.isEmpty()) return UNKNOWN;
        if (ok.contains(k)) return OK;
        if (ko.contains(k)) return KO;
        unrecognized.computeIfAbsent(raw.trim(), x -> new LongAdder()).increment();
        return UNKNOWN;
    }

    /**
     * Tokens seen that matched neither list, by original spelling, descending by count.
     * ADR-0013 exists so an empty tab names its own cause; this is the same principle one level
     * down — a PENDING card naming its own cause.
     */
    public Map<String, Long> unrecognized() {
        return unrecognized.entrySet().stream()
            .sorted(Map.Entry.<String, LongAdder>comparingByValue(
                    Comparator.comparingLong(LongAdder::sum)).reversed()
                .thenComparing(Map.Entry.comparingByKey()))
            .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue().sum(),
                (a, b) -> a, LinkedHashMap::new));
    }
}
```

- [x] **Step 4: Add the `B15` config record**

In `Etl360Properties.java`, add `B15 b15` as the last record component, mirroring the `LayerToLayer` pattern exactly (`:62-78`):

```java
@ConfigurationProperties(prefix = "etl360")
public record Etl360Properties(String corpusRoot, String dwhControlRoot, String mockRoot,
                               String composerRoot, Gcp gcp, LayerToLayer layerToLayer, B15 b15) {

    @ConstructorBinding
    public Etl360Properties {
        layerToLayer = layerToLayer == null ? LayerToLayer.DEFAULTS : layerToLayer.withDefaults();
        b15 = b15 == null ? B15.DEFAULTS : b15.withDefaults();
    }
```

Both existing convenience constructors delegate with `B15.DEFAULTS`, so no existing call site changes:

```java
    /** Pre-{@code layerToLayer} arity, kept so call sites that don't care about the control-schema
     * vocabulary (most tests) stay readable. Binds nothing — Spring uses the canonical one. */
    public Etl360Properties(String corpusRoot, String dwhControlRoot, String mockRoot,
                            String composerRoot, Gcp gcp) {
        this(corpusRoot, dwhControlRoot, mockRoot, composerRoot, gcp, LayerToLayer.DEFAULTS, B15.DEFAULTS);
    }

    /** Pre-{@code b15} arity, same reason. */
    public Etl360Properties(String corpusRoot, String dwhControlRoot, String mockRoot,
                            String composerRoot, Gcp gcp, LayerToLayer layerToLayer) {
        this(corpusRoot, dwhControlRoot, mockRoot, composerRoot, gcp, layerToLayer, B15.DEFAULTS);
    }
```

and the nested record itself:

```java
    /**
     * The b15 {@code status} vocabulary. Configurable for the same reason {@link LayerToLayer} is:
     * the committed values are this corpus's anonymized sample dialect, and a real export that
     * writes a different token used to fail SILENTLY — every failed run rendering as PENDING.
     * See {@link io.pure360.etl360.service.support.B15Status}.
     */
    public record B15(List<String> statusOk, List<String> statusKo) {
        public static final B15 DEFAULTS = new B15(
            io.pure360.etl360.service.support.B15Status.DEFAULT_OK,
            io.pure360.etl360.service.support.B15Status.DEFAULT_KO);

        /** A partially-specified binding (only one key set) keeps the default for the other. */
        B15 withDefaults() {
            List<String> ok = statusOk == null || statusOk.isEmpty()
                ? B15Status.DEFAULT_OK : List.copyOf(statusOk);
            List<String> ko = statusKo == null || statusKo.isEmpty()
                ? B15Status.DEFAULT_KO : List.copyOf(statusKo);
            return new B15(ok, ko);
        }
    }
```

Add `import io.pure360.etl360.service.support.B15Status;` to the file's imports.

- [x] **Step 5: Run tests to verify they pass**

Run: `mvn -q -am -pl backend test -Dtest=B15StatusTest`
Expected: PASS, 6 tests.

- [x] **Step 6: Run the full backend suite — nothing else may move**

Run: `mvn -q -am -pl backend test`
Expected: PASS. The new record component is additive with a defaulting binding constructor, so no existing test's `Etl360Properties` construction breaks.

- [x] **Step 7: Commit**

```bash
git add backend/src/main/java/io/pure360/etl360/service/support/B15Status.java \
        backend/src/test/java/io/pure360/etl360/service/B15StatusTest.java \
        backend/src/main/java/io/pure360/etl360/config/Etl360Properties.java \
        docs/superpowers/plans/2026-08-29-operational-clarity.md
git commit -m "feat(b15): canonicalise the status vocabulary so FAILURE is a KO

A real Composer export writes FAILURE; the codebase compared four closed
literal sets containing only SUCCESS/FAILED, so every failed run rendered
as PENDING — 'never ran'. B15Status canonicalises at one boundary and
reports what it could not recognize."
```

---

## Task 2: apply the normalizer at the read boundary

**Files:**
- Modify: `backend/src/main/java/io/pure360/etl360/service/B15Reader.java`
- Create: `backend/src/test/resources/mock-status-dialect/b15_application_end_with_recipe_null_status.csv`
- Create: `backend/src/test/java/io/pure360/etl360/service/B15ReaderStatusDialectTest.java`

**Interfaces:**
- Consumes: `B15Status` (Task 1), `Etl360Properties.B15` (Task 1).
- Produces: `B15Reader.status()` → the live `B15Status` instance, for Task 3's diagnostics.

- [x] **Step 1: Write the fixture**

`backend/src/test/resources/mock-status-dialect/b15_application_end_with_recipe_null_status.csv` — the header must match `B15Reader`'s `cell(...)` keys exactly. Uses the user-reported real-world shape, including a comma inside the quoted `message`:

```csv
cluster_name,recipe_filename,job_id,app_start_iso,avg_job_duration_in_mins_sec,status,message
cluster-dialect-a,_ETL_A_RECIPE.json,etl-a_recipe-20260818-0800,2026-08-18T06:01:11.117Z,54m 37sec,FAILURE,"Exception message: writeResultAndErrors failed: [fullVersionedAudit] Failed to write staging table 'project.DWH.TABLE_X'. No changes have been made to 'Table'."
cluster-dialect-a,_ETL_B_RECIPE.json,etl-b_recipe-20260818-0800,2026-08-18T06:02:11.117Z,3m 04sec,SUCCEEDED,
cluster-dialect-a,_ETL_C_RECIPE.json,etl-c_recipe-20260818-0800,2026-08-18T06:03:11.117Z,1m 12sec,SKIPPED,
cluster-dialect-a,_ETL_D_RECIPE.json,etl-d_recipe-20260818-0800,2026-08-18T06:04:11.117Z,0m 44sec,SUCCESS,
```

- [x] **Step 2: Write the failing test**

```java
package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.B15RowDto;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The status dialect is proven against a TEST-ONLY fixture. The committed m_CAS_* b15 rows are
 * manifest-generated and frozen (root CLAUDE.md), so no mock floor moves for this test to pass.
 */
class B15ReaderStatusDialectTest {

    private List<B15RowDto> readFixture() {
        // Construct B15Reader against src/test/resources/mock-status-dialect, following the
        // construction idiom already used by the other B15Reader tests in this package.
        return TestB15.rowsFrom("mock-status-dialect");
    }

    @Test
    void failureBecomesFailedRatherThanPending() {
        B15RowDto row = readFixture().stream()
            .filter(r -> r.recipeFilename().equals("_ETL_A_RECIPE.json")).findFirst().orElseThrow();
        assertThat(row.status()).isEqualTo("FAILED");
    }

    @Test
    void succeededBecomesSuccess() {
        B15RowDto row = readFixture().stream()
            .filter(r -> r.recipeFilename().equals("_ETL_B_RECIPE.json")).findFirst().orElseThrow();
        assertThat(row.status()).isEqualTo("SUCCESS");
    }

    @Test
    void anUnrecognizedTokenBecomesBlankAndIsReported() {
        B15RowDto row = readFixture().stream()
            .filter(r -> r.recipeFilename().equals("_ETL_C_RECIPE.json")).findFirst().orElseThrow();
        assertThat(row.status()).isEmpty();
    }

    @Test
    void theQuotedMessageCommaDoesNotShiftColumns() {
        // Guards the fixture itself: a naive split(",") would push the message into `status`.
        B15RowDto row = readFixture().stream()
            .filter(r -> r.recipeFilename().equals("_ETL_A_RECIPE.json")).findFirst().orElseThrow();
        assertThat(row.message()).startsWith("Exception message: writeResultAndErrors failed");
        assertThat(row.avgJobDurationInMinsSec()).isEqualTo("54m 37sec");
    }
}
```

Write `TestB15.rowsFrom(String testResourceDir)` as a small package-private helper in the same test package, constructing `B15Reader` exactly the way the existing `B15Reader` tests do — read them first and copy their construction, rather than inventing a second idiom.

- [x] **Step 3: Run test to verify it fails**

Run: `mvn -q -am -pl backend test -Dtest=B15ReaderStatusDialectTest`
Expected: FAIL — `expected "FAILED" but was "FAILURE"` (the reader passes the token through raw today).

- [x] **Step 4: Canonicalise at parse**

In `B15Reader.java`, hold a `B15Status` built from `Etl360Properties.b15()` (constructor-injected, like the other properties this class reads), expose it, and wrap the status cell at `:141`:

```java
    /** Exposed so DiagnosticsService can report tokens this reader could not recognize. */
    public B15Status status() { return status; }
```

```java
                out.add(new B15RowDto(
                    cell(row, "cluster_name"), cell(row, "recipe_filename"), cell(row, "job_id"),
                    cell(row, "app_start_iso"), cell(row, "avg_job_duration_in_mins_sec"),
                    // Canonicalised HERE, at the one boundary, so ClusterIndexService,
                    // ClusterController, OperationalService and the frontend all keep comparing
                    // exactly two literals and need no change.
                    status.canonical(cell(row, "status")), cell(row, "message")));
```

- [x] **Step 5: Run tests to verify they pass**

Run: `mvn -q -am -pl backend test -Dtest=B15ReaderStatusDialectTest`
Expected: PASS, 4 tests.

- [x] **Step 6: Run the full backend suite**

Run: `mvn -q -am -pl backend test`
Expected: PASS. The committed mock writes `SUCCESS`/`FAILED`, which canonicalise to themselves, so every existing count is unchanged.

- [x] **Step 7: Commit**

```bash
git add backend/src/main/java/io/pure360/etl360/service/B15Reader.java \
        backend/src/test/resources/mock-status-dialect/b15_application_end_with_recipe_null_status.csv \
        backend/src/test/java/io/pure360/etl360/service/B15ReaderStatusDialectTest.java \
        docs/superpowers/plans/2026-08-29-operational-clarity.md
git commit -m "fix(b15): canonicalise status at parse, proven on a test-only dialect fixture"
```

---

## Task 3: unrecognized statuses in /api/diagnostics

**Files:**
- Modify: `backend/src/main/java/io/pure360/etl360/service/DiagnosticsService.java`
- Modify: the diagnostics DTO it returns
- Modify/Create: `backend/src/test/java/io/pure360/etl360/api/DiagnosticsContractTest.java` (extend the existing one if present)

**Interfaces:**
- Consumes: `B15Reader.status()` (Task 2).
- Produces: `/api/diagnostics` gains `b15.unrecognizedStatuses: [{ value, count }]`, consumed by Task 14's gate.

- [x] **Step 1: Read the existing diagnostics shape**

Run: `sed -n '1,200p' backend/src/main/java/io/pure360/etl360/service/DiagnosticsService.java` and read the DTO it builds. Add the new field following that file's existing nesting convention — do not restructure it.

- [x] **Step 2: Write the failing test**

Extend the existing diagnostics contract test with:

```java
    @Test
    void reportsB15StatusTokensItCouldNotRecognize() throws Exception {
        // The committed mock uses only canonical tokens, so this asserts the FIELD EXISTS and is
        // empty — the shape a real export's "SKIPPED ×3" would populate. B15StatusTest covers the
        // counting itself; this covers the wire.
        mockMvc.perform(get("/api/diagnostics"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.b15.unrecognizedStatuses").isArray())
            .andExpect(jsonPath("$.b15.unrecognizedStatuses").isEmpty());
    }
```

- [x] **Step 3: Run test to verify it fails**

Run: `mvn -q -am -pl backend test -Dtest=DiagnosticsContractTest`
Expected: FAIL — no such JSON path.

- [x] **Step 4: Add the field**

Map `B15Reader.status().unrecognized()` (a `Map<String, Long>`) into a list of `{ value, count }` records, newest-largest first — the ordering `B15Status.unrecognized()` already guarantees.

- [x] **Step 5: Run tests to verify they pass**

Run: `mvn -q -am -pl backend test -Dtest=DiagnosticsContractTest`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add backend/src/main/java/io/pure360/etl360/service/DiagnosticsService.java \
        backend/src/main/java/io/pure360/etl360/api/dto/ \
        backend/src/test/java/io/pure360/etl360/api/DiagnosticsContractTest.java \
        docs/superpowers/plans/2026-08-29-operational-clarity.md
git commit -m "feat(diagnostics): report b15 status tokens the reader could not recognize"
```

---

## Task 4: GET /api/operational/search

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/api/dto/SearchHitsDto.java`
- Modify: `backend/src/main/java/io/pure360/etl360/api/ClusterController.java`
- Create: `backend/src/test/java/io/pure360/etl360/api/OperationalSearchContractTest.java`

**Interfaces:**
- Consumes: `ClusterIndexService.Index` (`byCluster()`, `runsByRecipe()`), `RelationshipService.graph()`, `LayerToLayerService`.
- Produces: `GET /api/operational/search?q=&limit=` → `SearchHitsDto { List<HitDto> hits, boolean truncated }`, `HitDto { String kind, String name, String layer, List<String> clusters }`. Consumed by Task 12.

- [x] **Step 1: Write the DTO**

```java
package io.pure360.etl360.api.dto;

import java.util.List;

/**
 * Cross-index search over the b15 history and the relationships graph.
 *
 * <p>This performs the recipe -> table -> cluster join ADR-0014 deliberately kept OFF the client:
 * table names exist only in the L2L graph, which is never fetched unscoped on a real export, so a
 * client-side search structurally cannot see tables. Bounded by construction so this endpoint
 * cannot become the scale problem ADR-0014 solved.
 */
public record SearchHitsDto(List<HitDto> hits, boolean truncated) {
    /** {@code kind} is "recipe" or "table"; {@code clusters} are the b15 clusters that reach it. */
    public record HitDto(String kind, String name, String layer, List<String> clusters) {}
}
```

- [x] **Step 2: Write the failing test**

```java
package io.pure360.etl360.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class OperationalSearchContractTest {

    @Autowired MockMvc mockMvc;

    @Test
    void findsRecipesBySubstringAndNamesTheirClusters() throws Exception {
        mockMvc.perform(get("/api/operational/search").param("q", "CAS"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.hits[?(@.kind=='recipe')]").isNotEmpty())
            .andExpect(jsonPath("$.hits[?(@.kind=='recipe')].clusters").isNotEmpty());
    }

    @Test
    void findsTablesToo() throws Exception {
        // The whole point: table names live only in the L2L graph, so a client-side search
        // over the b15 index structurally cannot find them.
        mockMvc.perform(get("/api/operational/search").param("q", "CAS"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.hits[?(@.kind=='table')]").isNotEmpty());
    }

    @Test
    void isCaseInsensitive() throws Exception {
        mockMvc.perform(get("/api/operational/search").param("q", "cas"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.hits").isNotEmpty());
    }

    @Test
    void aTooShortQueryReturnsEmptyRatherThanErroring() throws Exception {
        mockMvc.perform(get("/api/operational/search").param("q", "c"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.hits").isEmpty())
            .andExpect(jsonPath("$.truncated").value(false));
    }

    @Test
    void limitBoundsTheResultAndSetsTruncated() throws Exception {
        mockMvc.perform(get("/api/operational/search").param("q", "_").param("limit", "2"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.hits.length()").value(2))
            .andExpect(jsonPath("$.truncated").value(true));
    }

    @Test
    void rejectsAnOutOfRangeLimit() throws Exception {
        mockMvc.perform(get("/api/operational/search").param("q", "cas").param("limit", "500"))
            .andExpect(status().isBadRequest());
    }
}
```

- [x] **Step 3: Run test to verify it fails**

Run: `mvn -q -am -pl backend test -Dtest=OperationalSearchContractTest`
Expected: FAIL — 404 on `/api/operational/search`.

- [x] **Step 4: Implement the endpoint**

Add to `ClusterController` (it already holds `ClusterIndexService`, `LayerToLayerService`; inject `RelationshipService`):

```java
    static final int SEARCH_MIN_Q = 2;
    static final int SEARCH_DEFAULT_LIMIT = 50;
    static final int SEARCH_MAX_LIMIT = 200;

    /**
     * Substring search over b15 recipe names AND relationship-graph table names, each hit
     * carrying the clusters that reach it. Bounded by construction — see {@link SearchHitsDto}.
     */
    @GetMapping("/search")
    public SearchHitsDto search(@RequestParam("q") String q,
                                @RequestParam(name = "limit", defaultValue = "" + SEARCH_DEFAULT_LIMIT) int limit) {
        if (limit < 1 || limit > SEARCH_MAX_LIMIT) {
            throw new InvalidRequestException("limit must be between 1 and " + SEARCH_MAX_LIMIT + ", got " + limit);
        }
        String needle = q == null ? "" : q.trim().toLowerCase(Locale.ROOT);
        // A one-character query matches most of the corpus; returning empty is the honest answer,
        // and an error would make the panel flash red as the user types the first letter.
        if (needle.length() < SEARCH_MIN_Q) return new SearchHitsDto(List.of(), false);
        ...
    }
```

Build it as: (1) `clustersByRecipe` from `index.runsByRecipe()`; (2) recipe hits from `index.runsByRecipe().keySet()`; (3) table hits from `RelationshipService.graph()` nodes of kind `table`, whose clusters are the union of `clustersByRecipe` over every recipe joined to that table by an edge in either direction. Sort recipes before tables, each alphabetically, so results are deterministic. Take `limit + 1` to decide `truncated`, then trim to `limit`.

- [x] **Step 5: Run tests to verify they pass**

Run: `mvn -q -am -pl backend test -Dtest=OperationalSearchContractTest`
Expected: PASS, 6 tests.

- [x] **Step 6: Run the full backend suite**

Run: `mvn -q -am -pl backend test`
Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add backend/src/main/java/io/pure360/etl360/api/dto/SearchHitsDto.java \
        backend/src/main/java/io/pure360/etl360/api/ClusterController.java \
        backend/src/test/java/io/pure360/etl360/api/OperationalSearchContractTest.java \
        docs/superpowers/plans/2026-08-29-operational-clarity.md
git commit -m "feat(api): GET /api/operational/search joins recipes, tables and clusters"
```

---

## Task 5: footprint-driven pitch

Defect 1's data half. Pure adapter change, no component change yet.

**Files:**
- Modify: `frontend/src/api/relationshipsAdapter.ts:32-36,51,136`
- Modify: `frontend/src/api/relationshipsAdapter.test.ts`

**Interfaces:**
- Produces: `DENSITY_FOOTPRINT`, `DENSITY_GUTTER`, `MIN_GUTTER`, and `DENSITY_PITCH` (same `{ col, row, width, height }` shape as today, now derived). Consumed by Task 6.

- [x] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import {
  DENSITY_FOOTPRINT, DENSITY_GUTTER, DENSITY_PITCH, MIN_GUTTER, toOperationalGraph,
} from './relationshipsAdapter'
import type { CardDensity } from '../types'

const DENSITIES: CardDensity[] = ['detailed', 'compact', 'minimal']

describe('density geometry', () => {
  // The regression gate. The shipped table declared row:190 for a card that renders ~280px
  // tall, so every detailed card overlapped the one below it by ~90px. A pitch can no longer
  // be smaller than the box it spaces, because it is DERIVED from it.
  it.each(DENSITIES)('pitch exceeds footprint by at least MIN_GUTTER at %s', d => {
    expect(DENSITY_PITCH[d].col).toBeGreaterThanOrEqual(DENSITY_FOOTPRINT[d].width + MIN_GUTTER)
    expect(DENSITY_PITCH[d].row).toBeGreaterThanOrEqual(DENSITY_FOOTPRINT[d].height + MIN_GUTTER)
  })

  it.each(DENSITIES)('pitch is exactly footprint + gutter at %s', d => {
    expect(DENSITY_PITCH[d].col).toBe(DENSITY_FOOTPRINT[d].width + DENSITY_GUTTER[d].col)
    expect(DENSITY_PITCH[d].row).toBe(DENSITY_FOOTPRINT[d].height + DENSITY_GUTTER[d].row)
  })

  it.each(DENSITIES)('pitch still exposes width/height for existing readers at %s', d => {
    expect(DENSITY_PITCH[d].width).toBe(DENSITY_FOOTPRINT[d].width)
    expect(DENSITY_PITCH[d].height).toBe(DENSITY_FOOTPRINT[d].height)
  })
})

describe('layoutCards produces no overlapping cards', () => {
  // A fan-in graph: two recipes writing one table, plus a lookup — enough to force two cards
  // into the same column, which is where the row pitch has to hold.
  const graph = {
    nodes: [
      { id: 's1', kind: 'table',  name: 'STG.SRC_ONE',        layer: 'STG' },
      { id: 's2', kind: 'table',  name: 'STG.SRC_TWO',        layer: 'STG' },
      { id: 'r1', kind: 'recipe', name: '_ETL_m_ONE.json',    layer: 'DWH' },
      { id: 'r2', kind: 'recipe', name: '_ETL_m_TWO.json',    layer: 'DWH' },
      { id: 't1', kind: 'table',  name: 'DWH.TARGET',         layer: 'DWH' },
    ],
    edges: [
      { from: 's1', to: 'r1', kind: 'source' },
      { from: 's2', to: 'r2', kind: 'source' },
      { from: 'r1', to: 't1', kind: 'writes' },
      { from: 'r2', to: 't1', kind: 'writes' },
    ],
    meta: { layers: ['STG', 'DWH'] },
  }

  it.each(DENSITIES)('no two footprint rectangles intersect at %s', d => {
    const { cards } = toOperationalGraph(graph as never, undefined, null, d)
    const { width, height } = DENSITY_FOOTPRINT[d]
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i]!, b = cards[j]!
        const overlaps =
          (a.x ?? 0) < (b.x ?? 0) + width && (b.x ?? 0) < (a.x ?? 0) + width &&
          (a.y ?? 0) < (b.y ?? 0) + height && (b.y ?? 0) < (a.y ?? 0) + height
        expect(overlaps, `${a.name} overlaps ${b.name} at ${d}`).toBe(false)
      }
    }
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test relationshipsAdapter`
Expected: FAIL — `DENSITY_FOOTPRINT` is not exported.

- [x] **Step 3: Replace the table with a derived one**

```ts
/**
 * The card's real on-screen box, per density.
 *
 * `detailed`'s 280 is the measured height of the TALLEST detailed card — a recipe with a stats
 * grid and both GCP links (OperationalCard.tsx:127-266). It cannot be asserted in vitest (jsdom
 * has no layout engine and reports every height as 0); it is verified in the browser acceptance
 * walk. The shipped table said 150, which is why every detailed card overlapped the one below.
 */
export const DENSITY_FOOTPRINT: Record<CardDensity, { width: number; height: number }> = {
  detailed: { width: 260, height: 280 },
  compact:  { width: 240, height: 56 },
  minimal:  { width: 210, height: 26 },
}

/** Empty space BETWEEN footprints — the room the edges are drawn in, so arrows stay readable. */
export const DENSITY_GUTTER: Record<CardDensity, { col: number; row: number }> = {
  detailed: { col: 80, row: 50 },
  compact:  { col: 60, row: 40 },
  minimal:  { col: 40, row: 20 },
}

/** The floor the invariant test enforces, independent of the gutters above. */
export const MIN_GUTTER = 16

/**
 * DERIVED, never hand-maintained: pitch = footprint + gutter. The predecessor was a hand-written
 * table whose `row` (190) was smaller than its own `height` (150) was wrong about (~280 real),
 * so cards overlapped. Deriving it makes that arithmetic impossible to get wrong again.
 * Keeps `width`/`height` members so `fitToViewport` and `layoutCards` read unchanged.
 */
export const DENSITY_PITCH: Record<CardDensity, { col: number; row: number; width: number; height: number }> =
  Object.fromEntries(
    (Object.keys(DENSITY_FOOTPRINT) as CardDensity[]).map(d => [d, {
      col: DENSITY_FOOTPRINT[d].width + DENSITY_GUTTER[d].col,
      row: DENSITY_FOOTPRINT[d].height + DENSITY_GUTTER[d].row,
      width: DENSITY_FOOTPRINT[d].width,
      height: DENSITY_FOOTPRINT[d].height,
    }]),
  ) as Record<CardDensity, { col: number; row: number; width: number; height: number }>
```

- [x] **Step 4: Run tests to verify they pass**

Run: `cd frontend && pnpm test relationshipsAdapter`
Expected: PASS.

- [x] **Step 5: Run the whole frontend suite and typecheck**

Run: `cd frontend && pnpm test && npx tsc --noEmit`
Expected: PASS. Existing tests that assert specific `x`/`y` values will need their expected numbers updated to the new pitch — update them, do not loosen the assertions.

- [x] **Step 6: Commit**

```bash
git add frontend/src/api/relationshipsAdapter.ts frontend/src/api/relationshipsAdapter.test.ts \
        docs/superpowers/plans/2026-08-29-operational-clarity.md
git commit -m "fix(tab3): derive card pitch from a real footprint so cards stop overlapping"
```

---

## Task 6: the canvas obeys the footprint

Defect 1's render half — this is the change that fixes images 14 and 15.

**Files:**
- Modify: `frontend/src/components/tab3/ETLOperational.tsx:151-152,282`
- Modify: `frontend/src/components/tab3/ETLOperational.test.tsx`

**Interfaces:**
- Consumes: `DENSITY_FOOTPRINT` (Task 5).

- [x] **Step 1: Write the failing test**

```tsx
it('renders every card at its declared footprint width, at every density', async () => {
  // `width: 'auto'` let a compact/minimal card grow to its longest name — past its own column
  // pitch — which is what made real-corpus names overlap horizontally.
  for (const density of ['detailed', 'compact', 'minimal'] as const) {
    setOperationalView({ density })
    const { container, unmount } = renderOperational()
    await screen.findByTestId('card-wrapper')
    for (const el of container.querySelectorAll<HTMLElement>('[data-testid="card-wrapper"]')) {
      expect(el.style.width).toBe(`${DENSITY_FOOTPRINT[density].width}px`)
    }
    unmount()
  }
})
```

Add `data-testid="card-wrapper"` to the positioned wrapper at `:277-290` in the same step.

- [x] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test ETLOperational`
Expected: FAIL — `expected "auto" to be "240px"`.

- [x] **Step 3: Point both call sites at the footprint**

At `:282`:

```tsx
              // Fixed, never 'auto': an auto-width card grows to its longest name and overruns
              // the column pitch that was computed for its declared width.
              width: DENSITY_FOOTPRINT[density].width,
```

At `:151-152`:

```tsx
  // Canvas extent = furthest card + its own footprint, not two hardcoded numbers that only
  // matched the `detailed` density they were written for.
  const foot = DENSITY_FOOTPRINT[density]
  const CANVAS_W = Math.max(1200, ...cards.map(c => (c.x ?? 0) + foot.width))
  const CANVAS_H = Math.max(700, ...cards.map(c => (c.y ?? 0) + foot.height))
```

- [x] **Step 4: Run tests to verify they pass**

Run: `cd frontend && pnpm test ETLOperational && npx tsc --noEmit`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/tab3/ETLOperational.tsx frontend/src/components/tab3/ETLOperational.test.tsx \
        docs/superpowers/plans/2026-08-29-operational-clarity.md
git commit -m "fix(tab3): render cards at their declared width instead of auto"
```

---

## Task 7: semantic colour module

**Files:**
- Create: `frontend/src/theme/semanticColors.ts`
- Create: `frontend/src/theme/semanticColors.test.ts`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Produces: `layerColor(layer: string): string`, `kindPalette(kind: 'table' | 'recipe'): { accent, tint, border, statusEdge: 'top' | 'left' }`, `statusColor(status: string): string`, `statusBg(status: string): string`, and the constants `LAYER_COLOR`, `KIND_PALETTE`, `STATUS_COLOR`. Consumed by Tasks 8 and 9.

- [x] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { layerColor, kindPalette, statusColor, LAYER_COLOR } from './semanticColors'
import { LAYER_RANK } from '../api/relationshipsAdapter'

describe('layer palette', () => {
  it('assigns the medallion tiers the spec names', () => {
    expect(layerColor('STG')).toBe(layerColor('ODS'))          // bronze
    expect(layerColor('DWH')).toBe(layerColor('ETL'))          // silver
    expect(layerColor('CDM')).toBe(layerColor('QDM'))          // gold
    expect(layerColor('CDM')).toBe(layerColor('RDM'))
    expect(layerColor('OUTPUT')).not.toBe(layerColor('CDM'))   // platinum, not gold
  })

  it('covers every layer the adapter can rank — no layer falls through uncoloured', () => {
    for (const layer of Object.keys(LAYER_RANK)) {
      expect(LAYER_COLOR[layer], layer).toBeDefined()
    }
  })

  it('keeps the three tiers mutually distinct', () => {
    const tiers = [layerColor('STG'), layerColor('DWH'), layerColor('CDM'), layerColor('OUTPUT')]
    expect(new Set(tiers).size).toBe(4)
  })

  it('gives an unresolved layer a deliberately neutral colour', () => {
    // UNKNOWN is OperationalService's fallback, so its appearance is diagnostic: it must not
    // look like a fourth tier.
    expect(layerColor('UNKNOWN')).toBe('#4a5570')
    expect(layerColor('NOT_A_LAYER')).toBe(layerColor('UNKNOWN'))
  })
})

describe('kind palette', () => {
  it('puts the status bar on a different edge per kind', () => {
    expect(kindPalette('table').statusEdge).toBe('top')
    expect(kindPalette('recipe').statusEdge).toBe('left')
  })

  it('uses the BigQuery and Spark accents', () => {
    expect(kindPalette('table').accent).toBe('#4f9cf9')
    expect(kindPalette('recipe').accent).toBe('#fb923c')
  })

  it('never reuses a layer colour as a kind accent', () => {
    // The defect this module fixes: the layer chip used to be coloured by KIND.
    const layerColours = new Set(Object.values(LAYER_COLOR))
    expect(layerColours.has(kindPalette('table').accent)).toBe(false)
    expect(layerColours.has(kindPalette('recipe').accent)).toBe(false)
  })
})

describe('status palette', () => {
  it('keeps the shipped OK/KO/PENDING colours', () => {
    expect(statusColor('OK')).toBe('#34d399')
    expect(statusColor('KO')).toBe('#f87171')
    expect(statusColor('PENDING')).toBe('#4a5570')
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test semanticColors`
Expected: FAIL — module not found.

- [x] **Step 3: Write the module**

```ts
// ─── semanticColors ─────────────────────────────────────────────────────────
//
// The ONLY place in the frontend that maps a layer, a kind, or a status to a colour.
//
// Before this module, `OperationalCard.tsx:104,158` coloured the LAYER chip by KIND — so CDM
// rendered blue on a table and amber on a recipe, and neither colour meant "CDM". Kind, layer
// and status were mutually indistinguishable at a glance. Three orthogonal facts now get three
// disjoint palettes, and the toolbar's filter chips (which read the same maps) are the legend.
//
// Hex values are duplicated from `index.css`'s custom properties on purpose: these are consumed
// in inline `style` objects and by tests, neither of which can resolve a `var()`. `index.css` is
// the source of truth for the DESIGN; this file is the source of truth for the VALUE. Change
// both together.

export type CardKind = 'table' | 'recipe'

/** Medallion tiers: raw / refined / curated, plus export and an unresolved fallback. */
export const LAYER_COLOR: Record<string, string> = {
  STG: '#b0764a', ODS: '#b0764a',                    // bronze — raw
  DWH: '#9aa6b8', ETL: '#9aa6b8',                    // silver — refined
  CDM: '#d4a537', QDM: '#d4a537', RDM: '#d4a537',    // gold   — curated
  OUTPUT: '#cfd8e6',                                 // platinum — export
  UNKNOWN: '#4a5570',                                // deliberately colourless
}

export function layerColor(layer: string): string {
  return LAYER_COLOR[layer] ?? LAYER_COLOR.UNKNOWN!
}

export interface KindPalette {
  accent: string
  tint: string
  border: string
  /** Which edge carries the status bar — the kind is readable from geometry, not just hue. */
  statusEdge: 'top' | 'left'
}

/** GCP product colours: a table is a BigQuery table, a recipe is a Dataproc/Spark job. */
export const KIND_PALETTE: Record<CardKind, KindPalette> = {
  table:  { accent: '#4f9cf9', tint: 'rgba(79,156,249,0.07)',  border: 'rgba(79,156,249,0.28)',  statusEdge: 'top' },
  recipe: { accent: '#fb923c', tint: 'rgba(251,146,60,0.07)',  border: 'rgba(251,146,60,0.28)',  statusEdge: 'left' },
}

export function kindPalette(kind: CardKind): KindPalette {
  return KIND_PALETTE[kind]
}

export const STATUS_COLOR: Record<string, string> = {
  OK: '#34d399', KO: '#f87171', RUNNING: '#fbbf24', PENDING: '#4a5570',
}

export const STATUS_BG: Record<string, string> = {
  OK: 'rgba(52,211,153,0.08)', KO: 'rgba(248,113,113,0.08)',
  RUNNING: 'rgba(251,191,36,0.08)', PENDING: 'rgba(74,85,112,0.08)',
}

export function statusColor(status: string): string { return STATUS_COLOR[status] ?? STATUS_COLOR.PENDING! }
export function statusBg(status: string): string { return STATUS_BG[status] ?? STATUS_BG.PENDING! }

/** The shared depth treatment — the "shadowy, subtle" card the design asks for. */
export const CARD_SHADOW = '0 2px 10px rgba(0,0,0,0.35)'
```

- [x] **Step 4: Add the custom properties**

Append to the `:root` block in `frontend/src/index.css`, after `--cyan`:

```css
  /* Tab 3 semantic palette — ADR-0017. Kind = GCP product, layer = medallion tier. */
  --bq-blue: #4f9cf9;
  --spark-orange: #fb923c;
  --layer-bronze: #b0764a;
  --layer-silver: #9aa6b8;
  --layer-gold: #d4a537;
  --layer-platinum: #cfd8e6;
  --layer-unknown: #4a5570;
```

- [x] **Step 5: Run tests to verify they pass**

Run: `cd frontend && pnpm test semanticColors && npx tsc --noEmit`
Expected: PASS, 8 tests.

- [x] **Step 6: Commit**

```bash
git add frontend/src/theme/semanticColors.ts frontend/src/theme/semanticColors.test.ts \
        frontend/src/index.css docs/superpowers/plans/2026-08-29-operational-clarity.md
git commit -m "feat(tab3): one semantic palette for kind, layer and status"
```

---

## Task 8: cards adopt the palette

**Files:**
- Modify: `frontend/src/components/shared/OperationalCard.tsx`
- Modify: `frontend/src/components/shared/OperationalCard.test.tsx`

**Interfaces:**
- Consumes: `layerColor`, `kindPalette`, `statusColor`, `statusBg`, `CARD_SHADOW` (Task 7).

- [x] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { OperationalCard } from './OperationalCard'
import { layerColor, kindPalette } from '../../theme/semanticColors'
import type { OperationalCard as CardData } from '../../types'

const base: CardData = {
  id: 'n1', kind: 'recipe', name: '_ETL_m_DM_MOD_GARANTIA.json', layer: 'CDM',
  status: 'OK', lastRun: '2026-08-18T00:00:00Z', history: ['OK'],
  stats: { avg_time_s: 0, p50: 0, p95: 0, p99: 0, avg_count: 0 }, relations: [],
}

describe('card palette', () => {
  it('colours the layer chip by LAYER, not by kind', () => {
    // The defect: `CDM` used to render blue on a table and amber on a recipe.
    const asRecipe = render(<OperationalCard card={base} />)
    const recipeChip = asRecipe.getByText('CDM')
    const asTable = render(<OperationalCard card={{ ...base, kind: 'table' }} />)
    const tableChip = asTable.getByText('CDM')
    expect(recipeChip).toHaveStyle({ color: layerColor('CDM') })
    expect(tableChip).toHaveStyle({ color: layerColor('CDM') })
  })

  it.each(['detailed', 'compact', 'minimal'] as const)(
    'puts a recipe status bar on the LEFT edge at %s', d => {
      render(<OperationalCard card={base} density={d} />)
      const box = screen.getByTestId('operational-card')
      expect(box).toHaveStyle({ borderLeftColor: '#34d399' })
    })

  it.each(['detailed', 'compact', 'minimal'] as const)(
    'puts a table status bar on the TOP edge at %s', d => {
      render(<OperationalCard card={{ ...base, kind: 'table' }} density={d} />)
      const box = screen.getByTestId('operational-card')
      expect(box).toHaveStyle({ borderTopColor: '#34d399' })
    })

  it('tints a recipe body Spark orange and a table body BigQuery blue', () => {
    render(<OperationalCard card={base} />)
    expect(screen.getByTestId('operational-card'))
      .toHaveStyle({ background: kindPalette('recipe').tint })
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test OperationalCard`
Expected: FAIL — no `operational-card` testid; layer chip colour is kind-derived.

- [x] **Step 3: Restyle all three densities**

In each of the three return branches (`:52`, `:79`, `:128`):
- add `data-testid="operational-card"`
- delete the local `STATUS_COLOR`/`STATUS_BG` maps (`:11-23`) and import them from `semanticColors`
- replace both layer-chip expressions (`:104`, `:158`) with `layerColor(card.layer)` for the text and `${layerColor(card.layer)}26` for the background
- set body `background: kindPalette(card.kind).tint`, `border: 1px solid ${kindPalette(card.kind).border}`, `boxShadow: CARD_SHADOW`
- replace the `borderLeft: 3px solid ${color}` with an edge chosen by `kindPalette(card.kind).statusEdge`: `borderLeftWidth: 3` + `borderLeftColor: color` for recipes, `borderTopWidth: 3` + `borderTopColor: color` for tables

Apply the status edge to the `minimal` branch too — today it has no status bar at all, only a dot.

- [x] **Step 4: Run tests to verify they pass**

Run: `cd frontend && pnpm test OperationalCard && npx tsc --noEmit`
Expected: PASS.

- [x] **Step 5: Confirm Tabs 1/2/4 are untouched**

Run: `cd frontend && pnpm test`
Expected: PASS. `OperationalCard` is used only by Tab 3 and the Tab 3 detail panel — confirm with `grep -rn "OperationalCard" frontend/src --include=*.tsx | grep -v test` before committing, and record the result in the commit body.

- [x] **Step 6: Commit**

```bash
git add frontend/src/components/shared/OperationalCard.tsx \
        frontend/src/components/shared/OperationalCard.test.tsx \
        docs/superpowers/plans/2026-08-29-operational-clarity.md
git commit -m "feat(tab3): tables read BigQuery blue, recipes Spark orange, layers by tier"
```

---

## Task 9: toolbar chips become the legend

**Files:**
- Modify: `frontend/src/components/tab3/ETLOperational.tsx:773-779,1006`
- Modify: `frontend/src/components/tab3/ETLOperational.test.tsx`

**Interfaces:**
- Consumes: `layerColor`, `kindPalette` (Task 7).

- [x] **Step 1: Write the failing test**

```tsx
it('tints the Layer and Kind filter chips with the palette they filter by', async () => {
  renderOperational()
  await screen.findByText('CDM')
  // The toolbar IS the legend: the control you filter with teaches the colour.
  expect(screen.getByRole('button', { name: 'CDM' })).toHaveStyle({ color: layerColor('CDM') })
  expect(screen.getByRole('button', { name: 'recipe' }))
    .toHaveStyle({ color: kindPalette('recipe').accent })
  expect(screen.getByRole('button', { name: 'table' }))
    .toHaveStyle({ color: kindPalette('table').accent })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test ETLOperational`
Expected: FAIL — chips render `#4a5570` when unselected.

- [x] **Step 3: Pass colours to the existing prop**

`FilterChips` already accepts `colors?: Record<string, string>` (`:1006`). Supply it for both filters, and change the unselected-chip `color` at `:1027` to fall back to the supplied colour rather than always `#4a5570`:

```tsx
        <FilterChips label="Layer" options={['ALL', ...graph.layers]} value={layerFilter}
          onChange={setLayerFilter}
          colors={Object.fromEntries(graph.layers.map(l => [l, layerColor(l)]))} />
        <FilterChips label="Kind" options={['ALL', 'recipe', 'table']} value={kindFilter}
          onChange={setKindFilter}
          colors={{ recipe: kindPalette('recipe').accent, table: kindPalette('table').accent }} />
```

- [x] **Step 4: Run tests to verify they pass**

Run: `cd frontend && pnpm test ETLOperational && npx tsc --noEmit`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/tab3/ETLOperational.tsx frontend/src/components/tab3/ETLOperational.test.tsx \
        docs/superpowers/plans/2026-08-29-operational-clarity.md
git commit -m "feat(tab3): the filter chips are the palette legend"
```

---

## Task 10: pane-aware summary + tighter selection strip

Defects 2 and 5. Both are small, both are pure presentation, and a reviewer would accept or reject them together.

**Files:**
- Modify: `frontend/src/components/tab3/ETLOperational.tsx:319-327` and the `RelationshipGraph` prop list
- Modify: `frontend/src/components/tab3/SelectionStrip.tsx:46,59`
- Modify: `frontend/src/components/tab3/ETLOperational.test.tsx`, `SelectionStrip.test.tsx`

- [x] **Step 1: Write the failing tests**

```tsx
// ETLOperational.test.tsx
it('hides the floating snapshot chip while the cluster pane is collapsed', async () => {
  renderOperational()
  expect(await screen.findByTestId('snapshot-chip')).toBeInTheDocument()
  // Collapsing the pane is the "maximum canvas" gesture — the chip must honour it too,
  // instead of sitting on top of the cards it was covering.
  await userEvent.click(screen.getByLabelText('Collapse cluster pane'))
  expect(screen.queryByTestId('snapshot-chip')).not.toBeInTheDocument()
  await userEvent.click(screen.getByLabelText('Expand cluster pane'))
  expect(await screen.findByTestId('snapshot-chip')).toBeInTheDocument()
})
```

```tsx
// SelectionStrip.test.tsx
it('renders the stats at readable contrast on a darker strip', () => {
  setOperationalView({ selectedClusters: ['c1'] })
  render(<SelectionStrip summary={{ recipes: 4, dates: 2, ok: 8, ko: 1, nodes: 9, neighbors: 0 }} />)
  const stats = screen.getByTestId('selection-stats')
  expect(stats).toHaveStyle({ color: 'var(--text-muted)' })
  expect(screen.getByTestId('selection-strip')).toHaveStyle({ background: 'var(--bg)' })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd frontend && pnpm test -- SelectionStrip ETLOperational`
Expected: FAIL — no `snapshot-chip`/`selection-stats` testids; chip is unconditional.

- [x] **Step 3: Implement**

`RelationshipGraph` gains `summaryVisible: boolean` in its props interface (`:83-105`) and gates the chip:

```tsx
      {/* Task 16's floating chip, now pane-aware: an explicit PROP rather than a store read,
          because this component is memo'd over its props and a store read bypasses the memo. */}
      {summaryVisible && summaryItems.length > 0 && (
        <div data-testid="snapshot-chip" style={{ ... }}>
```

At the call site (`:861`), pass `summaryVisible={!view.paneCollapsed}`.

`SelectionStrip.tsx`: add `data-testid="selection-strip"` with `padding: '4px 10px'` and `background: 'var(--bg)'` at `:46`; add `data-testid="selection-stats"` with `color: 'var(--text-muted)'` at `:59`.

- [x] **Step 4: Run tests to verify they pass**

Run: `cd frontend && pnpm test && npx tsc --noEmit`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/tab3/ETLOperational.tsx frontend/src/components/tab3/SelectionStrip.tsx \
        frontend/src/components/tab3/ETLOperational.test.tsx frontend/src/components/tab3/SelectionStrip.test.tsx \
        docs/superpowers/plans/2026-08-29-operational-clarity.md
git commit -m "fix(tab3): the snapshot chip follows the pane; the selection strip reads"
```

---

## Task 11: collapsible TIME VIEW

**Files:**
- Modify: `frontend/src/state/operationalView.ts`
- Modify: `frontend/src/components/tab3/ETLOperational.tsx:836-847`
- Modify: `frontend/src/state/operationalView.test.ts`, `ETLOperational.test.tsx`

**Interfaces:**
- Produces: `OperationalViewState.timeViewCollapsed: boolean`, persisted.

- [x] **Step 1: Write the failing tests**

```ts
// operationalView.test.ts
it('persists timeViewCollapsed', () => {
  setOperationalView({ timeViewCollapsed: true })
  expect(JSON.parse(localStorage.getItem('etl360.tab3.view')!).timeViewCollapsed).toBe(true)
})

it('ignores a corrupt timeViewCollapsed instead of white-screening', () => {
  // Same hazard `density` documents at operationalView.ts:36-44 — a bad persisted value must
  // never reach a render, because it would do so again on every reload with no in-app way out.
  localStorage.setItem('etl360.tab3.view', JSON.stringify({ timeViewCollapsed: 'yes' }))
  resetOperationalView()
  expect(useOperationalViewState().timeViewCollapsed).toBe(false)
})
```

```tsx
// ETLOperational.test.tsx
it('frees the whole bar when the time view is hidden, and names the date in a chip', async () => {
  renderOperational()
  await screen.findByTestId('time-view-bar')
  await userEvent.click(screen.getByLabelText('Hide time view'))
  expect(screen.queryByTestId('time-view-bar')).not.toBeInTheDocument()
  // The active snapshot is never invisible — the chip carries it.
  const chip = screen.getByTestId('time-view-chip')
  expect(chip).toHaveTextContent(/\d{4}-\d{2}-\d{2}/)
  await userEvent.click(chip)
  expect(await screen.findByTestId('time-view-bar')).toBeInTheDocument()
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd frontend && pnpm test -- operationalView ETLOperational`
Expected: FAIL — `timeViewCollapsed` is not a key; no testids.

- [x] **Step 3: Add the state key**

In `operationalView.ts`: add `timeViewCollapsed: boolean` to the interface, `false` to `DEFAULTS`, `'timeViewCollapsed'` to `PERSISTED_KEYS`, and to `VALIDATORS`:

```ts
  timeViewCollapsed: v => typeof v === 'boolean' ? v : undefined,
```

- [x] **Step 4: Implement the collapse**

Wrap the row at `:836-847` in `{!view.timeViewCollapsed && (...)}` with `data-testid="time-view-bar"`, add a `✕`-style `aria-label="Hide time view"` button at its right end, and render the chip in the toolbar when collapsed:

```tsx
        {view.timeViewCollapsed && (
          <button
            data-testid="time-view-chip"
            aria-label="Show time view"
            onClick={() => setOperationalView({ timeViewCollapsed: false })}
            style={{ ...zoomBtn, width: 'auto', padding: '0 10px', fontSize: 10,
                     fontFamily: 'JetBrains Mono, monospace', gap: 5 }}
          >
            {`⏱ ${view.selectedDate ?? '—'} · ${timeMeta.hour}h ▾`}
          </button>
        )}
```

- [x] **Step 5: Run tests to verify they pass**

Run: `cd frontend && pnpm test && npx tsc --noEmit`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add frontend/src/state/operationalView.ts frontend/src/state/operationalView.test.ts \
        frontend/src/components/tab3/ETLOperational.tsx frontend/src/components/tab3/ETLOperational.test.tsx \
        docs/superpowers/plans/2026-08-29-operational-clarity.md
git commit -m "feat(tab3): TIME VIEW collapses to a chip and frees the whole bar"
```

---

## Task 12: related history — back / forward

**Files:**
- Modify: `frontend/src/state/operationalView.ts`
- Modify: `frontend/src/components/tab3/ETLOperational.tsx:898-913`
- Modify: `frontend/src/state/operationalView.test.ts`, `ETLOperational.test.tsx`

**Interfaces:**
- Produces: `NodeVisit { nodeId: string; zoom: number; pan: { x: number; y: number } }`; store keys `nodeHistory: NodeVisit[]`, `historyIndex: number`; functions `visitNode(visit: NodeVisit): void`, `stepHistory(delta: -1 | 1): void`, `HISTORY_CAP = 25`. Consumed by Task 13.

- [x] **Step 1: Write the failing tests**

```ts
// operationalView.test.ts
const visit = (id: string, x: number) => ({ nodeId: id, zoom: 1, pan: { x, y: 0 } })

it('records each visit and steps back through node AND canvas view', () => {
  visitNode(visit('a', 10)); visitNode(visit('b', 20)); visitNode(visit('c', 30))
  stepHistory(-1)
  expect(readState().selectedNode).toBe('b')
  // Back restores the view you LEFT it at, not merely an auto-pan onto the node.
  expect(readState().pan).toEqual({ x: 20, y: 0 })
  stepHistory(1)
  expect(readState().selectedNode).toBe('c')
})

it('a new visit truncates the forward entries', () => {
  visitNode(visit('a', 10)); visitNode(visit('b', 20))
  stepHistory(-1)
  visitNode(visit('z', 90))
  stepHistory(1)                       // nothing forward of 'z'
  expect(readState().selectedNode).toBe('z')
})

it('caps the stack at 25, dropping the oldest', () => {
  for (let i = 0; i < 30; i++) visitNode(visit(`n${i}`, i))
  expect(readState().nodeHistory).toHaveLength(HISTORY_CAP)
  expect(readState().nodeHistory[0]!.nodeId).toBe('n5')
})

it('is a no-op at either end', () => {
  visitNode(visit('a', 10))
  stepHistory(-1); stepHistory(-1)
  expect(readState().selectedNode).toBe('a')
  stepHistory(1)
  expect(readState().selectedNode).toBe('a')
})

it('never persists history — a selection must not outlive a reload', () => {
  visitNode(visit('a', 10))
  expect(JSON.parse(localStorage.getItem('etl360.tab3.view')!).nodeHistory).toBeUndefined()
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd frontend && pnpm test operationalView`
Expected: FAIL — `visitNode` is not exported.

- [x] **Step 3: Implement the stack**

```ts
export interface NodeVisit {
  nodeId: string
  zoom: number
  pan: { x: number; y: number }
}

/** Matches Tab 2's undo stack, so the app has ONE answer to "how far back does history go". */
export const HISTORY_CAP = 25

/**
 * Record a visit and select it. Truncates any forward entries first — a new hop from the middle
 * of the stack forks the history, exactly as a browser's does.
 *
 * Never persisted (absent from PERSISTED_KEYS): a selection must not outlive a reload.
 */
export function visitNode(visit: NodeVisit): void {
  const kept = state.nodeHistory.slice(0, state.historyIndex + 1)
  kept.push(visit)
  const capped = kept.slice(-HISTORY_CAP)
  setOperationalView({
    nodeHistory: capped,
    historyIndex: capped.length - 1,
    selectedNode: visit.nodeId,
  })
}

/** Step back (-1) or forward (+1), restoring the node AND the canvas view it was left at. */
export function stepHistory(delta: -1 | 1): void {
  const next = state.historyIndex + delta
  const visit = state.nodeHistory[next]
  if (!visit) return                       // no-op at either end
  setOperationalView({
    historyIndex: next,
    selectedNode: visit.nodeId,
    zoom: visit.zoom,
    pan: visit.pan,
  })
}
```

Add `nodeHistory: []` and `historyIndex: -1` to `DEFAULTS`; leave both out of `PERSISTED_KEYS`.

- [x] **Step 4: Wire the controls**

Replace the `Related (n)` header at `:898-902` with a row carrying `◀`/`▶`, and change the related-card click at `:908` from `setOperationalView({ selectedNode: rid })` to `visitNode({ nodeId: rid, zoom: view.zoom, pan: view.pan })`. Also route canvas selection (`:857`) through `visitNode`.

```tsx
                <button aria-label="Back to previous node" disabled={view.historyIndex <= 0}
                  onClick={() => stepHistory(-1)} style={historyBtn(view.historyIndex > 0)}>◀</button>
                <button aria-label="Forward to next node"
                  disabled={view.historyIndex >= view.nodeHistory.length - 1}
                  onClick={() => stepHistory(1)}
                  style={historyBtn(view.historyIndex < view.nodeHistory.length - 1)}>▶</button>
```

- [x] **Step 5: Write the component test**

```tsx
it('walks back through three related hops to the node it started from', async () => {
  renderOperational()
  const start = await screen.findByText(/_ETL_m_CAS/)
  await userEvent.click(start)
  const first = screen.getByLabelText('Back to previous node')
  expect(first).toBeDisabled()
  // hop twice through Related, then unwind
  await userEvent.click(screen.getAllByTestId('related-card')[0]!)
  await userEvent.click(screen.getAllByTestId('related-card')[0]!)
  await userEvent.click(screen.getByLabelText('Back to previous node'))
  await userEvent.click(screen.getByLabelText('Back to previous node'))
  expect(screen.getByLabelText('Back to previous node')).toBeDisabled()
  expect(screen.getByLabelText('Forward to next node')).toBeEnabled()
})
```

- [x] **Step 6: Run tests to verify they pass**

Run: `cd frontend && pnpm test && npx tsc --noEmit`
Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add frontend/src/state/operationalView.ts frontend/src/state/operationalView.test.ts \
        frontend/src/components/tab3/ETLOperational.tsx frontend/src/components/tab3/ETLOperational.test.tsx \
        docs/superpowers/plans/2026-08-29-operational-clarity.md
git commit -m "feat(tab3): back/forward through related hops, restoring the canvas view"
```

---

## Task 13: Show All Related — overlay and real new tab

**Files:**
- Create: `frontend/src/components/tab3/RelatedOverlay.tsx`
- Create: `frontend/src/components/tab3/RelatedOverlay.test.tsx`
- Modify: `frontend/src/components/tab3/ETLOperational.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `visitNode` (Task 12), `OperationalCard`/`kindPalette` (Tasks 7-8).
- Produces: `<RelatedOverlay nodeId clusters onClose />`, and `readRelatedParam(): { nodeId: string; clusters: string[] } | null` in `App.tsx`.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('Show All Related', () => {
  it('opens the overlay on a plain left click', async () => {
    renderOperational()
    await userEvent.click(await screen.findByText(/_ETL_m_CAS/))
    await userEvent.click(screen.getByRole('link', { name: /show all related/i }))
    expect(await screen.findByTestId('related-overlay')).toBeInTheDocument()
  })

  it('is a real link, so the browser can open it in a new tab', () => {
    // No window.open, no synthetic button handling: an <a href> gets ⌘-click, middle-click and
    // "Open link in new tab" from the platform, all three correct for free.
    renderOperational()
    const link = screen.getByRole('link', { name: /show all related/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('?related='))
  })

  it('does not preventDefault on a modified click', async () => {
    renderOperational()
    const link = screen.getByRole('link', { name: /show all related/i })
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true })
    link.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
    expect(screen.queryByTestId('related-overlay')).not.toBeInTheDocument()
  })

  it('keeps the canvas selection in sync with the overlay focus', async () => {
    // Closing the overlay must leave you where you navigated, not snap back.
    renderOperational()
    await userEvent.click(await screen.findByText(/_ETL_m_CAS/))
    await userEvent.click(screen.getByRole('link', { name: /show all related/i }))
    const neighbour = (await screen.findAllByTestId('overlay-node'))[0]!
    const name = neighbour.textContent!
    await userEvent.click(neighbour)
    await userEvent.click(screen.getByLabelText('Close related overlay'))
    expect(screen.getByTestId('details-title')).toHaveTextContent(name)
  })
})
```

```tsx
// App.test.tsx
it('renders the related view standalone from ?related=', async () => {
  window.history.replaceState({}, '', '/?related=CDM.LKP_PAIS&clusters=cluster-a')
  render(<App />)
  expect(await screen.findByTestId('related-overlay')).toBeInTheDocument()
  // Standalone, exactly like focus mode — no tab shell.
  expect(screen.queryByPlaceholderText('Search files, mappings…')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && pnpm test -- RelatedOverlay ETLOperational App`
Expected: FAIL — no such component.

- [ ] **Step 3: Write `RelatedOverlay.tsx`**

Follow `PreviewOverlay.tsx`'s structure (read it first): fixed backdrop, `Esc` closes, `aria-label="Close related overlay"` on the close button, `data-testid="related-overlay"`. Body: the focused card centred, each of `card.relations` rendered as a `data-testid="overlay-node"` compact card around it with an edge drawn to the centre, each calling `visitNode` on click so the canvas behind stays in sync (spec §6.3) and every overlay hop joins the same history stack.

- [ ] **Step 4: Add the affordance in the detail panel**

Beside `Related (n)`, an anchor — never a button:

```tsx
                <a
                  href={`?related=${encodeURIComponent(selectedCard.id)}`
                    + `&clusters=${encodeURIComponent(view.selectedClusters.join(','))}`}
                  onClick={e => {
                    // Plain left click only. Every modified click falls through to the browser,
                    // which already implements ⌘-click, middle-click and the context menu
                    // correctly — there is nothing for us to reimplement.
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                    e.preventDefault()
                    setRelatedOverlay(selectedCard.id)
                  }}
                >Show all related ↗</a>
```

- [ ] **Step 5: Read `?related=` in `App.tsx`**

Mirror `readFocusRecipe` (`:175`): a `readRelatedParam()` reading `related` and `clusters` from `window.location.search`, and an early return rendering `<RelatedOverlay …/>` standalone, before the `TopBar`, exactly as focus mode does.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && pnpm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/tab3/RelatedOverlay.tsx frontend/src/components/tab3/RelatedOverlay.test.tsx \
        frontend/src/components/tab3/ETLOperational.tsx frontend/src/App.tsx frontend/src/App.test.tsx \
        frontend/src/components/tab3/ETLOperational.test.tsx \
        docs/superpowers/plans/2026-08-29-operational-clarity.md
git commit -m "feat(tab3): Show All Related — overlay on click, real new tab on modified click"
```

---

## Task 14: global search reaches Tab 3

**Files:**
- Create: `frontend/src/components/tab3/OperationalSearch.tsx`, `OperationalSearch.test.tsx`
- Modify: `frontend/src/api/queries.ts`, `frontend/src/App.tsx:269`
- Modify: `frontend/src/components/tab3/ETLOperational.tsx:763`

**Interfaces:**
- Consumes: `GET /api/operational/search` (Task 4).
- Produces: `useOperationalSearch(q: string)`, `<OperationalSearch query onPick />`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('finds a table with no cluster selected and navigates into its cluster', async () => {
  // The capability that did not exist: table names live only in the L2L graph, so before the
  // search endpoint there was no way to answer "which cluster runs this table?".
  setOperationalView({ selectedClusters: [] })
  renderOperational({ searchQuery: 'CAS_DWH' })
  const hit = await screen.findByTestId('search-hit-table')
  await userEvent.click(hit)
  expect(readState().selectedClusters.length).toBeGreaterThan(0)
})

it('shows results over the empty no-cluster state', async () => {
  setOperationalView({ selectedClusters: [] })
  renderOperational({ searchQuery: 'CAS' })
  expect(await screen.findByTestId('operational-search')).toBeInTheDocument()
  expect(screen.getByTestId('cluster-prompt')).toBeInTheDocument()
})

it('renders nothing for an empty query', () => {
  renderOperational({ searchQuery: '' })
  expect(screen.queryByTestId('operational-search')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && pnpm test -- OperationalSearch ETLOperational`
Expected: FAIL — `ETLOperational` accepts no `searchQuery` prop.

- [ ] **Step 3: Add the hook**

In `queries.ts`, following the file's existing `useQuery` idiom, with `enabled: q.trim().length >= 2`.

- [ ] **Step 4: Write the panel**

`OperationalSearch.tsx` — hits grouped by kind, `data-testid={`search-hit-${kind}`}`, each row naming its clusters; clicking sets `selectedClusters` to the hit's clusters and stores the node id to select once the scoped graph resolves. Render it above the tab body so it works in the no-cluster state too.

- [ ] **Step 5: Wire the prop and relabel the toolbar input**

`App.tsx:269` → `<ETLOperational searchQuery={activeTab === 'operational' ? searchQuery : ''} />`, matching the guard Tabs 1/2 use at `:259`/`:264`.

`ETLOperational.tsx:763` placeholder → `Filter this canvas…` — the old `Search tables / recipes…` was a promise it could not keep, since it can only see loaded cards.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && pnpm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/tab3/OperationalSearch.tsx frontend/src/components/tab3/OperationalSearch.test.tsx \
        frontend/src/api/queries.ts frontend/src/App.tsx frontend/src/components/tab3/ETLOperational.tsx \
        frontend/src/components/tab3/ETLOperational.test.tsx \
        docs/superpowers/plans/2026-08-29-operational-clarity.md
git commit -m "feat(tab3): the top-bar search finds tables and recipes across the whole history"
```

---

## Task 15: gates, config surface and docs

**Files:**
- Modify: `scripts/validate_loop.sh`, `scripts/dev.sh`, `config.example.json`
- Create: `docs/adr/0017-semantic-colour-system.md`, `0018-b15-status-vocabulary.md`, `0019-operational-search.md`
- Modify: `docs/architecture.md`, `HOW_TO_RUN_ON_YOUR_DATA.md`, root `CLAUDE.md`

- [ ] **Step 1: Extend `validate_loop.sh`**

Add to sweep (1), beside the existing cluster curls:

```bash
say "operational search"
hits=$(curl -fsS "$BASE/api/operational/search?q=CAS" | jq '.hits | length')
[ "$hits" -ge 1 ] || fail "search returned no hits for 'CAS' (expected >= 1)"
curl -fsS "$BASE/api/operational/search?q=CAS" | jq -e '.hits | map(.kind) | index("table")' >/dev/null \
  || fail "search found no TABLE hits — the L2L join is not wired"

say "b15 status vocabulary"
curl -fsS "$BASE/api/diagnostics" | jq -e '.b15.unrecognizedStatuses | length == 0' >/dev/null \
  || fail "committed mock produced unrecognized b15 status tokens"
```

- [ ] **Step 2: Assert no floor moved**

Run: `make validate-loop`
Expected: PASS, with `21 clusters · 30 recipes · 14 dates · 417 rows` and the readiness floors `81 XML · 86 recipes · 212 DDL` / `22` workflows all **unchanged**. If any moved, a corpus file was touched — revert it; that is a Global Constraint violation, not a floor to update.

- [ ] **Step 3: Config surface**

`config.example.json` gains `b15StatusOk` / `b15StatusKo` with the defaults; `scripts/dev.sh` maps them to `ETL360_B15_STATUS_OK` / `ETL360_B15_STATUS_KO` following the existing `layerToLayerTable` mapping. Verify with `scripts/dev.sh --check-config`.

- [ ] **Step 4: Write the three ADRs**

Use `docs/adr/0000-template.md`. **0017** — semantic colour system: kind = GCP product, layer = medallion tier, status = edge; `semanticColors.ts` is the only mapper; scoped amendment to ADR-0005. **0018** — b15 status vocabulary: the `FAILURE`→PENDING silent failure, one normalizer at the read boundary, canonical output unchanged, configurable like ADR-0013's anchor table, unrecognized tokens reported. **0019** — operational search: the recipe↔table↔cluster join ADR-0014 kept off the client, and why it is bounded.

- [ ] **Step 5: Update the docs**

`docs/architecture.md` — add `/api/operational/search` to the endpoint table and the `etl360.b15.*` keys to the config reference. `HOW_TO_RUN_ON_YOUR_DATA.md` — a status-vocabulary section, and add `B15Reader` to its per-section derivation table (the file's own currency rule). Root `CLAUDE.md` — the new endpoint, the new ADRs, the current spec/plan pointer.

- [ ] **Step 6: Full gate run**

Run: `make test && make check && make validate-loop`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/validate_loop.sh scripts/dev.sh config.example.json \
        docs/adr/0017-semantic-colour-system.md docs/adr/0018-b15-status-vocabulary.md \
        docs/adr/0019-operational-search.md docs/architecture.md HOW_TO_RUN_ON_YOUR_DATA.md \
        CLAUDE.md docs/superpowers/plans/2026-08-29-operational-clarity.md
git commit -m "docs+gate: ADRs 0017-0019, search and status gates in validate-loop"
```

---

## Task 16: browser acceptance walk

The only task that can settle §3.4's 280px assumption and §4's look. **Not optional** — the spec's acceptance criteria are defined as browser-verified.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-29-operational-clarity-design.md` (§12 Deviations, results)

- [ ] **Step 1: Boot the app**

Run: `make dev`. Wait for `:8080` health and `:8443`.

- [ ] **Step 2: Drive Chrome through the extension**

Load the browser tools in ONE `ToolSearch` call, open `https://localhost:8443`, enter the app, and walk **all twelve** acceptance criteria from spec §10 in order. Capture a screenshot per criterion.

Criterion 1 is the load-bearing one: select the largest committed-mock cluster, then at **each** of `detailed`, `compact` and `minimal`, confirm visually that **no card overlaps another** and that edges are visible between columns. If a detailed card is clipped or still overlaps, `DENSITY_FOOTPRINT.detailed.height` is too small — raise it, re-run Task 5's invariant test, and record the corrected value in spec §12.

- [ ] **Step 3: Record results**

Write a PASS/FAIL table into spec §12 with one line per criterion and the evidence for each. Record any sanctioned visual deviation explicitly rather than silently accepting it.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-29-operational-clarity-design.md \
        docs/superpowers/plans/2026-08-29-operational-clarity.md
git commit -m "docs(spec): browser acceptance walk results for sub-project 12"
```

---

## Task 17: merge

- [ ] **Step 1: Final full gate from a clean build**

Run: `mvn -q -am -pl backend clean test && cd frontend && pnpm test && npx tsc --noEmit && cd .. && make validate-loop`

- [ ] **Step 2: Confirm the constraints held**

Run: `git diff --stat main...HEAD -- parser/ backend/src/main/resources/mock/`
Expected: **empty**. Any output is a Global Constraint violation.

- [ ] **Step 3: Merge**

Use superpowers:finishing-a-development-branch. Merge `feat/etl360-operational-clarity` into `main`.
