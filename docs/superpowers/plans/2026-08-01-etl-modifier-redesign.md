# ETL Modifier Redesign — Implementation Plan (sub-project 8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Tab 2 (ETL Modifier) into a real IPC-style designer over `_ETL_*.json` recipes, backed by a documented machine-checkable IPC conformance ruleset, plus two pieces of cross-tab shell chrome.

**Architecture:** Three parts executed in order. Part 1 builds an IPC rule engine in `backend/.../service/ipc/` whose logic is Java, whose metadata (severity, citations, per-kind key schema, alias table) is `ipc-rules.json`, and whose prose is `docs/ipc/`; a three-way id-parity test binds them. Part 2 rebuilds Tab 2's body against that ruleset — a new Tab-2-only `IpcCanvas` (bands + drag) leaving `EtlCanvas` byte-identical for Tab 1, a schema-driven `Inspector` covering every key in the parser recipe model, a conformance chip, recipe-only scoping, and focus mode. Part 3 adds a view-aware corpus summary and shared loading states.

**Tech Stack:** Java 17 / Spring Boot 3.3 (backend), React 19 / TypeScript / Vite (frontend), JUnit 5 + AssertJ + MockMvc, Vitest + React Testing Library + MSW, Node ≥22.6 `--experimental-strip-types` for sweeps.

**Spec:** `docs/superpowers/specs/2026-08-01-etl-modifier-redesign-design.md` — section references below (`spec §5.3`) point there.

## Global Constraints

- **No new frontend runtime dependencies.** `frontend/package.json` `dependencies` stays exactly `@tanstack/react-query`, `react`, `react-dom`. No `react-flow`, `dnd-kit`, `d3-drag` (spec §2).
- **No parser changes.** No file under `parser/src/main/scala` is modified by any task.
- **No corpus byte changes.** No `_ETL_*.json`, `.xml`/`.XML`, or DDL JSON under `parser/src/main/resources/xmltobq` is edited. The alias table is display/validation only (spec §5.3, CLAUDE.md hard rule 2).
- **`EtlCanvas.tsx` and `NodeBox.tsx` are not modified by any task.** Tab 1's canvas stays byte-identical (spec §12). `ETLViewer.tsx` changes in exactly two places, both spec §12-sanctioned: the Explorer summary footer (Task 16) and the shared loading state (Task 17). Its canvas usage, node rendering and detail panel are untouched.
- **Figma visual contract (ADR-0005):** new UI composes only existing tokens — `--surface`, `--surface-2`, `--surface-3`, `--border`, `--border-subtle`, `--bg`, `--red`, `--green`, `--cyan`, `--text-dim`, and `NODE_STYLES` kind colors. No new tokens, no restyling outside spec §12's seven sanctioned items.
- **Corpus floors unchanged:** 81 XMLs, 86 recipes, 33 L2L entries.
- **`valid` semantics are frozen:** `RecipeValidationDto.valid` stays `errors.isEmpty()`. Warnings never block a save (spec §5.5).
- **Staging discipline:** every commit stages explicit paths. **NEVER `git add -A`** — the working tree carries user-local untracked files (`.claude/settings.json`, `first_prompt.md`).
- **Ledger:** tick this plan's checkboxes and stage this plan file in the same commit as the task's changes. Resume point = first unticked checkbox.
- **`types.gen.ts` is generated**, never hand-edited. Refresh with `make generate-api` against a running backend.
- **Report backend test counts from `mvn clean test`, never a warm build.** `backend/target/surefire-reports/` accumulates reports from deleted test classes, so a warm run silently counts tests that no longer exist. This produced a ~6-test inflation across Tasks 5–9 (reported 167, true 161) before Task 9's reviewer caught it. Cross-check `ls backend/target/surefire-reports/*.txt | wc -l` against `find backend/src/test/java -name '*Test.java' | wc -l` — they must match.
- Dot-refs (`TABLE.FIELD`) are preserved verbatim everywhere (CLAUDE.md hard rule 3).

## File Structure

**Backend — new, `backend/src/main/java/io/pure360/etl360/`:**

| File | Responsibility |
|---|---|
| `service/ipc/IpcVocabulary.java` | Canonical type/key vocabulary + the alias table. Pure static. |
| `service/ipc/IpcCatalog.java` | Loads `ipc-rules.json`; serves rule metadata, key schema, aliases. |
| `service/ipc/IpcRule.java` | Rule interface: `id()` + `check(RuleContext, List<IpcCheck>)`. |
| `service/ipc/RuleContext.java` | Parsed recipe + derived indexes shared by all rules. |
| `service/ipc/IpcCheck.java` | One check outcome (record). |
| `service/ipc/StructuralRules.java` | `IPC-STR-*` rule instances. |
| `service/ipc/TypeShapeRules.java` | `IPC-TYP-*` rule instances, generated from the key schema. |
| `service/ipc/ReferentialRules.java` | `IPC-REF-*` rule instances. |
| `service/ipc/DataflowRules.java` | `IPC-FLW-*` rule instances. |
| `service/ipc/ExpressionRules.java` | `IPC-EXP-*` rule instances. |
| `service/ipc/IpcRuleEngine.java` | `@Service`; assembles all rules, runs them, returns checks. |
| `service/LayoutService.java` | Reads/writes `_layout_*.json` sidecars. |
| `service/support/LayoutSidecar.java` | Sidecar naming + exclusion predicate (mirrors `HistorySidecar`). |
| `api/IpcController.java` | `GET /api/ipc/rules`. |
| `api/LayoutController.java` | `GET`/`PUT /api/layouts/{*path}`. |
| `api/SummaryController.java` | `GET /api/summary`. |
| `api/dto/IpcCheckDto.java`, `IpcRuleMetaDto.java`, `IpcKeySpecDto.java`, `IpcRulesDto.java`, `LayoutDto.java`, `NodeOffsetDto.java`, `SummaryDto.java` | Wire records. |
| `resources/ipc/ipc-rules.json` | Rule metadata, alias table, per-kind key schema. |

**Frontend — new, `frontend/src/`:**

| File | Responsibility |
|---|---|
| `components/tab2/IpcCanvas.tsx` | Banded, draggable Tab-2 canvas. |
| `components/tab2/Inspector.tsx` | Schema-driven per-node property editor. |
| `components/tab2/InspectorWidgets.tsx` | Widget primitives (toggle, string list, row table). |
| `components/tab2/ConformanceChip.tsx` | Chip + drawer over validate `checks[]`. |
| `components/tab2/ExpressionDock.tsx` | Recipe-only draggable expression archive. |
| `components/tab2/SaveBar.tsx`, `components/tab2/DDLViewer.tsx` | Extracted from `ETLModifier.tsx` (pure moves). |
| `components/shared/Spinner.tsx` | `Spinner` + `LoadingState` + `TopProgressBar`. |
| `components/shared/CorpusSummary.tsx` | View-aware summary line. |
| `api/ipcRules.ts` | `useIpcRules`, `useValidation`, local structural checks. |
| `api/layoutQueries.ts` | `useLayout`, `putLayout`. |

**Modified:** `ETLModifier.tsx` (state + composition only), `Sidebar.tsx` (`fileFilter`, footer slot), `recipeAdapter.ts` (alias-aware `kindAndLabel`), `recipeEdits.ts` (generic property mutators), `queries.ts`, `App.tsx` (focus mode), `CorpusService.java` (`_layout_` exclusion, `summary()`), `RecipeService.java` (validate delegates to engine), `RecipeValidationDto.java`, `scripts/recipe_sweep.mts`, `scripts/validate_loop.sh`.

---

# Part 1 — IPC conformance

### Task 1: IPC vocabulary + alias table, confirmed against source XML

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/service/ipc/IpcVocabulary.java`
- Create: `backend/src/test/java/io/pure360/etl360/service/ipc/IpcVocabularyTest.java`
- Create: `backend/src/test/java/io/pure360/etl360/AliasWitnessContractTest.java`
- Create: `docs/ipc/README.md`
- Create: `docs/ipc/00-model-map.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `IpcVocabulary.canonicalTargetType(String) -> String`, `canonicalSourceType(String) -> String`, `canonicalKey(String) -> String`, `TARGET_TYPES: Set<String>`, `SOURCE_TYPES: Set<String>`, `TYPE_ALIASES: Map<String,String>`, `KEY_ALIASES: Map<String,String>`. Every later Part 1 task resolves types through this class rather than reading `type` raw.

- [x] **Step 1: Write the failing vocabulary test**

Create `backend/src/test/java/io/pure360/etl360/service/ipc/IpcVocabularyTest.java`:

```java
package io.pure360.etl360.service.ipc;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class IpcVocabularyTest {
    @Test
    void resolvesAnonymizedTargetTypeTokens() {
        assertThat(IpcVocabulary.canonicalTargetType("BERYLFALLS")).isEqualTo("sourceQualifier");
        assertThat(IpcVocabulary.canonicalTargetType("EARLYGLADE")).isEqualTo("unionInput");
        assertThat(IpcVocabulary.canonicalTargetType("ASHPATH2")).isEqualTo("joinerInput");
        assertThat(IpcVocabulary.canonicalTargetType("CEDARWICK2")).isEqualTo("storedProcedure");
    }

    @Test
    void passesCanonicalTypesThrough() {
        assertThat(IpcVocabulary.canonicalTargetType("table")).isEqualTo("table");
        assertThat(IpcVocabulary.canonicalSourceType("joiner")).isEqualTo("joiner");
    }

    @Test
    void unknownTypeResolvesToItself() {
        assertThat(IpcVocabulary.canonicalTargetType("NOSUCHTYPE")).isEqualTo("NOSUCHTYPE");
        assertThat(IpcVocabulary.TARGET_TYPES).doesNotContain("NOSUCHTYPE");
    }

    @Test
    void resolvesTheAnonymizedRouterGroupsKey() {
        assertThat(IpcVocabulary.canonicalKey("greencliff")).isEqualTo("groups");
        assertThat(IpcVocabulary.canonicalKey("weststone")).isEqualTo("fields");
        assertThat(IpcVocabulary.canonicalKey("fields")).isEqualTo("fields");
    }

    @Test
    void knowsAllTenTargetAndSourceKinds() {
        assertThat(IpcVocabulary.TARGET_TYPES).containsExactlyInAnyOrder(
            "table", "unionInput", "sourceQualifier", "filter", "joinerInput",
            "aggregator", "router", "normalizer", "java", "storedProcedure");
        assertThat(IpcVocabulary.SOURCE_TYPES).containsExactlyInAnyOrder(
            "table", "union", "sourceQualifier", "filter", "joiner",
            "aggregator", "router", "normalizer", "java", "storedProcedure");
    }
}
```

- [x] **Step 2: Run it to verify it fails**

Run: `mvn -am -pl backend test -Dtest=IpcVocabularyTest -DfailIfNoTests=false`
Expected: FAIL — compilation error, `IpcVocabulary` does not exist.

- [x] **Step 3: Write `IpcVocabulary`**

Create `backend/src/main/java/io/pure360/etl360/service/ipc/IpcVocabulary.java`:

```java
package io.pure360.etl360.service.ipc;

import java.util.Map;
import java.util.Set;

/**
 * Canonical IPC recipe vocabulary plus the anonymizer alias table.
 *
 * <p>The committed corpus is anonymized sample data (CLAUDE.md corpus caveats). Four step
 * {@code type} values and one structural key survive as anonymizer tokens rather than the
 * names {@code parser/src/main/scala/io/pure360/ipc/model/recipe/} actually emits. Each
 * mapping below is confirmed against the source XML — see
 * {@code AliasWitnessContractTest}, which re-asserts the exact witnesses, and spec §5.3.
 *
 * <p>This class NEVER rewrites corpus bytes. It resolves tokens for validation and display
 * only.
 */
public final class IpcVocabulary {
    private IpcVocabulary() {}

    /** Step target kinds — {@code AbstractTarget.scala:6-89}. */
    public static final Set<String> TARGET_TYPES = Set.of(
        "table", "unionInput", "sourceQualifier", "filter", "joinerInput",
        "aggregator", "router", "normalizer", "java", "storedProcedure");

    /** Step source kinds — {@code AbstractSource.scala:6-46}. */
    public static final Set<String> SOURCE_TYPES = Set.of(
        "table", "union", "sourceQualifier", "filter", "joiner",
        "aggregator", "router", "normalizer", "java", "storedProcedure");

    /**
     * Anonymized {@code type} token -> canonical kind. Witnesses (spec §5.3):
     * <ul>
     *   <li>{@code BERYLFALLS}: step {@code SQ_ff_BIZLINK} of {@code CDM/m_DM_INFOHUB_BIZLINK}
     *       is {@code <TRANSFORMATION TYPE="Source Qualifier">}.</li>
     *   <li>{@code ASHPATH2}: step {@code JNR_Ashshore.DETAIL} of
     *       {@code DWH/m_DWH_MAPLEGROVE_ACT_CLIENTMGR_PROFILES} is
     *       {@code <TRANSFORMATION TYPE="Joiner">}; the {@code .DETAIL} suffix is
     *       {@code AbstractTargetFactory.scala:88}.</li>
     *   <li>{@code CEDARWICK2}: step {@code SWIFTVALE_BIRCHMILL_OAKFORD_P_MAIN} of
     *       {@code QDM/m_GENERATE_ERROR_BRISKGROVE} is
     *       {@code <TRANSFORMATION TYPE="Stored Procedure">}.</li>
     *   <li>{@code EARLYGLADE}: step {@code LKP_CEDARMOOR_NETHUB_ELMYARD} of
     *       {@code CDM/m_DM_LKP_CONTACTREF_MEMBER_NETHUB_PAIR} is NOT a transformation name —
     *       it is {@code <GROUP TYPE="INPUT">}, which is exactly the input-group name
     *       {@code createUnionTarget} ({@code AbstractTargetFactory.scala:51-55}) gives a
     *       {@code UnionInputTarget}.</li>
     * </ul>
     */
    public static final Map<String, String> TYPE_ALIASES = Map.of(
        "BERYLFALLS", "sourceQualifier",
        "EARLYGLADE", "unionInput",
        "ASHPATH2", "joinerInput",
        "CEDARWICK2", "storedProcedure");

    /**
     * Anonymized structural key -> canonical key. {@code greencliff} holds a 14-entry
     * {@code RouterGroup} array ({@code AbstractTarget.scala:47}) on the corpus's single
     * router step {@code RTR_CIPHERKEY_OFFERING}, so it is {@code RouterTarget.groups}
     * ({@code AbstractTarget.scala:44}), not {@code updateOverride} — that Option is
     * {@code None} corpus-wide. {@code weststone} is the pre-repair {@code fields} spelling
     * (CLAUDE.md corpus caveats), still tolerated defensively.
     */
    public static final Map<String, String> KEY_ALIASES = Map.of(
        "greencliff", "groups",
        "weststone", "fields");

    public static String canonicalTargetType(String raw) { return resolve(raw, TARGET_TYPES); }

    public static String canonicalSourceType(String raw) { return resolve(raw, SOURCE_TYPES); }

    private static String resolve(String raw, Set<String> canonical) {
        if (raw == null) return "";
        if (canonical.contains(raw)) return raw;
        return TYPE_ALIASES.getOrDefault(raw, raw);
    }

    public static String canonicalKey(String rawKey) {
        if (rawKey == null) return "";
        return KEY_ALIASES.getOrDefault(rawKey, rawKey);
    }
}
```

- [x] **Step 4: Run it to verify it passes**

Run: `mvn -am -pl backend test -Dtest=IpcVocabularyTest -DfailIfNoTests=false`
Expected: PASS, 5 tests.

- [x] **Step 5: Write the failing alias-witness contract test**

This is the test that keeps the alias table honest against the real corpus. Note the two
different lookups — `EARLYGLADE`'s witness is a `GROUP` name, not a `TRANSFORMATION` name
(spec §5.3).

Create `backend/src/test/java/io/pure360/etl360/AliasWitnessContractTest.java`:

```java
package io.pure360.etl360;

import io.pure360.etl360.service.ipc.IpcVocabulary;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Re-asserts spec §5.3's alias witnesses against the committed corpus XML, so the alias table
 * can never silently drift from the data it claims to describe.
 */
class AliasWitnessContractTest {
    private static final Path CORPUS = Path.of("../parser/src/main/resources/xmltobq");

    private static String xml(String mappingPath) throws Exception {
        Path p = CORPUS.resolve(mappingPath + ".xml");
        if (!Files.isRegularFile(p)) p = CORPUS.resolve(mappingPath + ".XML");
        return Files.readString(p, StandardCharsets.UTF_8);
    }

    private static String transformationType(String doc, String name) {
        Matcher m = Pattern.compile("<TRANSFORMATION\\b[^>]*NAME\\s*=\\s*\"" + Pattern.quote(name)
            + "\"[^>]*TYPE\\s*=\\s*\"([^\"]*)\"").matcher(doc);
        return m.find() ? m.group(1) : null;
    }

    @Test
    void berylfallsIsASourceQualifier() throws Exception {
        assertThat(transformationType(xml("CDM/m_DM_INFOHUB_BIZLINK"), "SQ_ff_BIZLINK"))
            .isEqualTo("Source Qualifier");
        assertThat(IpcVocabulary.canonicalTargetType("BERYLFALLS")).isEqualTo("sourceQualifier");
    }

    @Test
    void ashpath2IsAJoiner() throws Exception {
        assertThat(transformationType(
            xml("DWH/m_DWH_MAPLEGROVE_ACT_CLIENTMGR_PROFILES"), "JNR_Ashshore")).isEqualTo("Joiner");
        assertThat(IpcVocabulary.canonicalTargetType("ASHPATH2")).isEqualTo("joinerInput");
    }

    @Test
    void cedarwick2IsAStoredProcedure() throws Exception {
        assertThat(transformationType(
            xml("QDM/m_GENERATE_ERROR_BRISKGROVE"), "SWIFTVALE_BIRCHMILL_OAKFORD_P_MAIN"))
            .isEqualTo("Stored Procedure");
        assertThat(IpcVocabulary.canonicalTargetType("CEDARWICK2")).isEqualTo("storedProcedure");
    }

    /** EARLYGLADE names an INPUT group, not a transformation — different evidence class. */
    @Test
    void earlygladeIsAUnionInputGroupName() throws Exception {
        String doc = xml("CDM/m_DM_LKP_CONTACTREF_MEMBER_NETHUB_PAIR");
        assertThat(transformationType(doc, "LKP_CEDARMOOR_NETHUB_ELMYARD")).isNull();
        assertThat(doc).containsPattern(
            "<GROUP\\b[^>]*NAME\\s*=\\s*\"LKP_CEDARMOOR_NETHUB_ELMYARD\"[^>]*TYPE\\s*=\\s*\"INPUT\"");
        assertThat(IpcVocabulary.canonicalTargetType("EARLYGLADE")).isEqualTo("unionInput");
    }

    @Test
    void greencliffIsRouterGroups() throws Exception {
        assertThat(transformationType(
            xml("ETL/m_DWH_E_MAPLEGROVE_DEALFLOW_MIS_GCP1"), "RTR_CIPHERKEY_OFFERING"))
            .isEqualTo("Router");
        assertThat(IpcVocabulary.canonicalKey("greencliff")).isEqualTo("groups");
    }
}
```

- [x] **Step 6: Run it to verify it passes**

Run: `mvn -am -pl backend test -Dtest=AliasWitnessContractTest -DfailIfNoTests=false`
Expected: PASS, 5 tests. If a path resolution fails, check the `CORPUS` relative base —
backend tests run with CWD `backend/`, so `../parser/...` is correct.

- [x] **Step 7: Write `docs/ipc/README.md`**

Content must cover, each as its own `##` section: what the wiki is; the provenance policy
verbatim from spec §5.1 (cite-don't-vendor, the observed `docs.informatica.com` 403, derive
the element inventory from our own 81 corpus XMLs, parser wins ties); the alias table as a
markdown table reproducing `IpcVocabulary`'s five entries with their witnesses; an
"authority map" stating which file is authoritative for what (`AbstractTarget.scala` /
`AbstractSource.scala` for shapes, `RecipeConstants.scala` for function and operator
vocabulary, `ipc-rules.json` for severities, this wiki for prose); and an index linking
`00-model-map.md`, `rules.md`, `expressions.md` and the `transformations/` pages that Task 6
creates.

- [x] **Step 8: Write `docs/ipc/00-model-map.md`**

A three-column table — IPC XML element → parser class (`file:line`) → recipe JSON key —
with one row per construct: `TRANSFORMATION@TYPE`, `TRANSFORMFIELD`, `TRANSFORMFIELD@GROUP`,
`GROUP@TYPE`, `CONNECTOR`, `TABLEATTRIBUTE`, `INSTANCE`, `SOURCEFIELD`, `TARGETFIELD`.
Include the observation from spec §4 that IPC `Expression` transformations are **not** steps
(`StepMode.scala:5` has no `EXPRESSION` value; `AbstractTarget` has no expression subclass)
and instead inline into field transformation trees as `EXP_*` call nodes.

- [x] **Step 9: Run the full backend suite and commit**

Run: `mvn -q -am -pl backend test`
Expected: PASS.

```bash
git add backend/src/main/java/io/pure360/etl360/service/ipc/IpcVocabulary.java \
        backend/src/test/java/io/pure360/etl360/service/ipc/IpcVocabularyTest.java \
        backend/src/test/java/io/pure360/etl360/AliasWitnessContractTest.java \
        docs/ipc/README.md docs/ipc/00-model-map.md \
        docs/superpowers/plans/2026-08-01-etl-modifier-redesign.md
git commit -m "feat(ipc): canonical vocabulary + alias table, witnessed against corpus XML

Task 1. IpcVocabulary resolves the four anonymized type tokens and the greencliff
key alias for validation/display only — corpus bytes untouched. AliasWitnessContractTest
re-asserts each witness against the real XML, using GROUP@NAME for EARLYGLADE (a union
input-group name, not a transformation) and TRANSFORMATION@TYPE for the other three."
```

---

### Task 2: Rule catalogue skeleton — `ipc-rules.json`, `IpcCatalog`, `IPC-STR-*`

**Files:**
- Create: `backend/src/main/resources/ipc/ipc-rules.json`
- Create: `backend/src/main/java/io/pure360/etl360/service/ipc/IpcCheck.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/ipc/IpcRule.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/ipc/RuleContext.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/ipc/IpcCatalog.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/ipc/StructuralRules.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/ipc/IpcRuleEngine.java`
- Create: `backend/src/test/java/io/pure360/etl360/service/ipc/StructuralRulesTest.java`

**Interfaces:**
- Consumes: `IpcVocabulary` (Task 1).
- Produces:
  - `record IpcCheck(String ruleId, String severity, String status, String path, String message)` — `status` is `"pass"` or `"fail"`.
  - `interface IpcRule { String id(); void check(RuleContext ctx, List<IpcCheck> out); }`
  - `RuleContext` with `JsonNode recipe()`, `List<JsonNode> steps()`, `JsonNode fieldsOf(JsonNode target)`, `String fieldsKey(JsonNode target)`, `String targetType(JsonNode target)`, `String sourceType(JsonNode source)`, `String stepPath(int i)`, `Set<String> targetNames()`, `Set<String> sourceNames()`, `Set<String> tableSourceNames()`, `boolean resolvesAsRefTarget(String)`.
  - `IpcCatalog.meta(String ruleId) -> IpcRuleMeta`, `IpcCatalog.rules() -> List<IpcRuleMeta>`, `IpcCatalog.keySchema() -> Map<String,List<IpcKeySpec>>`, plus nested records `IpcRuleMeta(String id, String severity, String statement, String parserRef, String ipcRef, String wikiRef)` and `IpcKeySpec(String key, String parserType, boolean required, String widget, String ruleId)`.
  - `IpcRuleEngine.run(JsonNode recipe) -> List<IpcCheck>`.
- Tasks 3–5 add rule classes implementing `IpcRule` and register them in `IpcRuleEngine`.

- [x] **Step 1: Write the failing structural-rules test**

Create `backend/src/test/java/io/pure360/etl360/service/ipc/StructuralRulesTest.java`:

```java
package io.pure360.etl360.service.ipc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class StructuralRulesTest {
    private static final ObjectMapper M = new ObjectMapper();
    private final IpcRuleEngine engine = new IpcRuleEngine(new IpcCatalog());

    private List<IpcCheck> failures(String json) throws Exception {
        JsonNode n = M.readTree(json);
        return engine.run(n).stream().filter(c -> "fail".equals(c.status())).toList();
    }

    private static final String VALID = """
        {"steps":[{"target":{"name":"T","type":"table","fields":[
            {"name":"A","dataType":"String","transformation":{"source":"S.A"}}]},
          "sources":[{"name":"S","type":"table"}]}],
         "table":{"targetTableNames":["T"],"sourceTableNames":["S"]}}""";

    @Test
    void aWellFormedRecipeHasNoStructuralFailures() throws Exception {
        assertThat(failures(VALID)).noneMatch(c -> c.ruleId().startsWith("IPC-STR-"));
    }

    @Test
    void emptyStepsFails() throws Exception {
        assertThat(failures("{\"steps\":[],\"table\":{}}"))
            .anyMatch(c -> c.ruleId().equals("IPC-STR-001"));
    }

    @Test
    void blankTargetNameFails() throws Exception {
        String json = VALID.replace("\"name\":\"T\"", "\"name\":\"\"");
        assertThat(failures(json)).anyMatch(c -> c.ruleId().equals("IPC-STR-003"));
    }

    @Test
    void unknownTargetTypeFails() throws Exception {
        String json = VALID.replace("\"type\":\"table\"", "\"type\":\"NOSUCHTYPE\"");
        assertThat(failures(json)).anyMatch(c -> c.ruleId().equals("IPC-STR-005"));
    }

    @Test
    void anonymizedTargetTypeDoesNotFail() throws Exception {
        String json = VALID.replace("\"type\":\"table\"", "\"type\":\"BERYLFALLS\"");
        assertThat(failures(json)).noneMatch(c -> c.ruleId().equals("IPC-STR-005"));
    }

    @Test
    void duplicateTargetNamesFail() throws Exception {
        String json = """
            {"steps":[
              {"target":{"name":"T","type":"table","fields":[]},"sources":[]},
              {"target":{"name":"T","type":"filter","fields":[]},"sources":[]}],
             "table":{"targetTableNames":["T"],"sourceTableNames":[]}}""";
        assertThat(failures(json)).anyMatch(c -> c.ruleId().equals("IPC-STR-006"));
    }

    @Test
    void duplicateFieldNamesWithinATargetFail() throws Exception {
        String json = """
            {"steps":[{"target":{"name":"T","type":"table","fields":[
                {"name":"A","dataType":"String","transformation":{"value":"1"}},
                {"name":"A","dataType":"String","transformation":{"value":"2"}}]},
              "sources":[]}],
             "table":{"targetTableNames":["T"],"sourceTableNames":[]}}""";
        assertThat(failures(json)).anyMatch(c -> c.ruleId().equals("IPC-STR-007"));
    }

    @Test
    void unknownDataTypeFails() throws Exception {
        String json = VALID.replace("\"dataType\":\"String\"", "\"dataType\":\"Blob\"");
        assertThat(failures(json)).anyMatch(c -> c.ruleId().equals("IPC-STR-008"));
    }

    @Test
    void weststoneFieldsKeyIsStillTolerated() throws Exception {
        String json = VALID.replace("\"fields\":", "\"weststone\":");
        assertThat(failures(json)).noneMatch(c -> c.ruleId().startsWith("IPC-STR-"));
    }

    @Test
    void everyEmittedCheckIdExistsInTheCatalogue() throws Exception {
        IpcCatalog catalog = new IpcCatalog();
        for (IpcCheck c : engine.run(M.readTree(VALID))) {
            assertThat(catalog.meta(c.ruleId())).as("catalogue entry for " + c.ruleId()).isNotNull();
        }
    }
}
```

- [x] **Step 2: Run it to verify it fails**

Run: `mvn -am -pl backend test -Dtest=StructuralRulesTest -DfailIfNoTests=false`
Expected: FAIL — compilation error, none of the `ipc` classes exist.

- [x] **Step 3: Write the records and interfaces**

Create `backend/src/main/java/io/pure360/etl360/service/ipc/IpcCheck.java`:

```java
package io.pure360.etl360.service.ipc;

/**
 * One rule outcome. {@code status} is {@code "pass"} or {@code "fail"}; {@code severity} is
 * copied from the catalogue entry so a consumer never has to join back to it.
 */
public record IpcCheck(String ruleId, String severity, String status, String path, String message) {
    public static IpcCheck fail(String ruleId, String severity, String path, String message) {
        return new IpcCheck(ruleId, severity, "fail", path, message);
    }

    public static IpcCheck pass(String ruleId, String severity) {
        return new IpcCheck(ruleId, severity, "pass", "$", "");
    }
}
```

Create `backend/src/main/java/io/pure360/etl360/service/ipc/IpcRule.java`:

```java
package io.pure360.etl360.service.ipc;

import java.util.List;

/**
 * One conformance rule. Implementations append a {@link IpcCheck#fail} per violation and
 * nothing on success — {@link IpcRuleEngine} synthesizes the passing check.
 */
public interface IpcRule {
    String id();
    void check(RuleContext ctx, List<IpcCheck> out);
}
```

Create `backend/src/main/java/io/pure360/etl360/service/ipc/RuleContext.java`:

```java
package io.pure360.etl360.service.ipc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.MissingNode;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** The parsed recipe plus the indexes every rule family needs, computed once per run. */
public final class RuleContext {
    private final JsonNode recipe;
    private final List<JsonNode> steps = new ArrayList<>();
    private final Set<String> targetNames = new LinkedHashSet<>();
    private final Set<String> sourceNames = new LinkedHashSet<>();
    private final Set<String> tableSourceNames = new LinkedHashSet<>();

    public RuleContext(JsonNode recipe) {
        this.recipe = recipe == null ? MissingNode.getInstance() : recipe;
        JsonNode s = this.recipe.path("steps");
        if (s.isArray()) s.forEach(steps::add);
        for (JsonNode step : steps) {
            String tn = step.path("target").path("name").asText("");
            if (!tn.isBlank()) targetNames.add(tn);
            JsonNode srcs = step.path("sources");
            if (srcs.isArray()) {
                for (JsonNode src : srcs) {
                    String n = src.path("name").asText("");
                    if (!n.isBlank()) sourceNames.add(n);
                }
            }
        }
        JsonNode st = this.recipe.path("table").path("sourceTableNames");
        if (st.isArray()) for (JsonNode n : st) if (n.isTextual()) tableSourceNames.add(n.asText());
    }

    public JsonNode recipe() { return recipe; }
    public List<JsonNode> steps() { return steps; }
    public Set<String> targetNames() { return targetNames; }
    public Set<String> sourceNames() { return sourceNames; }
    public Set<String> tableSourceNames() { return tableSourceNames; }

    public String stepPath(int i) { return "$.steps[" + i + "]"; }

    /** Canonical target type for a step target, alias-resolved. */
    public String targetType(JsonNode target) {
        return IpcVocabulary.canonicalTargetType(target.path("type").asText(""));
    }

    public String sourceType(JsonNode source) {
        return IpcVocabulary.canonicalSourceType(source.path("type").asText(""));
    }

    /** {@code fields} or the pre-repair {@code weststone} spelling; never null. */
    public JsonNode fieldsOf(JsonNode target) {
        JsonNode f = target.path("fields");
        if (f.isArray()) return f;
        JsonNode w = target.path("weststone");
        return w.isArray() ? w : MissingNode.getInstance();
    }

    /** The literal key {@link #fieldsOf} read, for error paths. */
    public String fieldsKey(JsonNode target) {
        return target.path("fields").isArray() ? "fields" : "weststone";
    }

    /** Case-insensitive membership across every name a dot-ref may address. */
    public boolean resolvesAsRefTarget(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        return containsIgnoreCase(targetNames, lower)
            || containsIgnoreCase(sourceNames, lower)
            || containsIgnoreCase(tableSourceNames, lower);
    }

    private static boolean containsIgnoreCase(Set<String> set, String lower) {
        for (String s : set) if (s.toLowerCase(Locale.ROOT).equals(lower)) return true;
        return false;
    }
}
```

- [x] **Step 4: Write `IpcCatalog` and the initial `ipc-rules.json`**

Create `backend/src/main/resources/ipc/ipc-rules.json`. Every rule this task implements gets
an entry; Tasks 3–5 append theirs. `keySchema` starts empty and is filled in Task 3.

```json
{
  "version": 1,
  "typeAliases": {
    "BERYLFALLS": "sourceQualifier",
    "EARLYGLADE": "unionInput",
    "ASHPATH2": "joinerInput",
    "CEDARWICK2": "storedProcedure"
  },
  "keyAliases": { "greencliff": "groups", "weststone": "fields" },
  "keySchema": {},
  "rules": [
    { "id": "IPC-STR-001", "severity": "error",
      "statement": "steps must be a non-empty array",
      "parserRef": "parser/src/main/scala/io/pure360/ipc/model/recipe/Recipe.scala:5",
      "ipcRef": "https://docs.informatica.com/data-integration/powercenter/10-5/designer-guide/mappings/validating-a-mapping.html",
      "wikiRef": "docs/ipc/rules.md#ipc-str-001" },
    { "id": "IPC-STR-002", "severity": "error",
      "statement": "every step must carry a target object",
      "parserRef": "parser/src/main/scala/io/pure360/ipc/model/recipe/Recipe.scala:7",
      "ipcRef": "", "wikiRef": "docs/ipc/rules.md#ipc-str-002" },
    { "id": "IPC-STR-003", "severity": "error",
      "statement": "every step target must have a non-blank name",
      "parserRef": "parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractItem.scala:7",
      "ipcRef": "", "wikiRef": "docs/ipc/rules.md#ipc-str-003" },
    { "id": "IPC-STR-004", "severity": "error",
      "statement": "every step target must have a non-blank type",
      "parserRef": "parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractItem.scala:8",
      "ipcRef": "", "wikiRef": "docs/ipc/rules.md#ipc-str-004" },
    { "id": "IPC-STR-005", "severity": "error",
      "statement": "every step target type must resolve to a known kind (canonical or alias)",
      "parserRef": "parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala:6",
      "ipcRef": "https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/working-with-transformations/transformations-overview/active-transformations.html",
      "wikiRef": "docs/ipc/rules.md#ipc-str-005" },
    { "id": "IPC-STR-006", "severity": "error",
      "statement": "step target names must be unique within a recipe",
      "parserRef": "parser/src/main/scala/io/pure360/ipc/model/recipe/Recipe.scala:7",
      "ipcRef": "", "wikiRef": "docs/ipc/rules.md#ipc-str-006" },
    { "id": "IPC-STR-007", "severity": "error",
      "statement": "field names must be unique within a step target",
      "parserRef": "parser/src/main/scala/io/pure360/ipc/model/recipe/Recipe.scala:9",
      "ipcRef": "", "wikiRef": "docs/ipc/rules.md#ipc-str-007" },
    { "id": "IPC-STR-008", "severity": "error",
      "statement": "every field dataType must be a ScalaType value",
      "parserRef": "parser/src/main/scala/io/pure360/ipc/model/enums/ScalaType.scala:7",
      "ipcRef": "", "wikiRef": "docs/ipc/rules.md#ipc-str-008" },
    { "id": "IPC-STR-009", "severity": "error",
      "statement": "every field must have a non-blank name",
      "parserRef": "parser/src/main/scala/io/pure360/ipc/model/recipe/Recipe.scala:9",
      "ipcRef": "", "wikiRef": "docs/ipc/rules.md#ipc-str-009" }
  ]
}
```

Create `backend/src/main/java/io/pure360/etl360/service/ipc/IpcCatalog.java`:

```java
package io.pure360.etl360.service.ipc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Rule metadata, alias table and per-kind key schema, loaded once from
 * {@code classpath:/ipc/ipc-rules.json}. Rule LOGIC lives in the {@link IpcRule}
 * implementations; only metadata lives here, and {@code IpcRulesContractTest} asserts the two
 * id sets match (spec §5.4).
 */
@Component
public class IpcCatalog {
    public record IpcRuleMeta(String id, String severity, String statement,
                              String parserRef, String ipcRef, String wikiRef) {}

    /** {@code ruleId} is the {@code IPC-TYP-*} id that fires when a {@code required} key is
     * missing; blank for optional keys. Carried explicitly rather than derived from array
     * position, so the JSON and the emitted check ids cannot drift apart. */
    public record IpcKeySpec(String key, String parserType, boolean required,
                             String widget, String ruleId) {}

    private final Map<String, IpcRuleMeta> byId = new LinkedHashMap<>();
    private final Map<String, List<IpcKeySpec>> keySchema = new LinkedHashMap<>();
    private final Map<String, String> typeAliases = new LinkedHashMap<>();
    private final Map<String, String> keyAliases = new LinkedHashMap<>();

    public IpcCatalog() {
        ObjectMapper mapper = new ObjectMapper();
        try (InputStream in = IpcCatalog.class.getResourceAsStream("/ipc/ipc-rules.json")) {
            if (in == null) throw new IllegalStateException("Missing classpath:/ipc/ipc-rules.json");
            JsonNode root = mapper.readTree(in);
            for (JsonNode r : root.path("rules")) {
                IpcRuleMeta meta = new IpcRuleMeta(
                    r.path("id").asText(), r.path("severity").asText(),
                    r.path("statement").asText(), r.path("parserRef").asText(),
                    r.path("ipcRef").asText(), r.path("wikiRef").asText());
                byId.put(meta.id(), meta);
            }
            root.path("keySchema").fields().forEachRemaining(e -> {
                List<IpcKeySpec> specs = new ArrayList<>();
                for (JsonNode k : e.getValue()) {
                    specs.add(new IpcKeySpec(k.path("key").asText(), k.path("parserType").asText(),
                        k.path("required").asBoolean(false), k.path("widget").asText(),
                        k.path("ruleId").asText("")));
                }
                keySchema.put(e.getKey(), List.copyOf(specs));
            });
            root.path("typeAliases").fields()
                .forEachRemaining(e -> typeAliases.put(e.getKey(), e.getValue().asText()));
            root.path("keyAliases").fields()
                .forEachRemaining(e -> keyAliases.put(e.getKey(), e.getValue().asText()));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    public IpcRuleMeta meta(String ruleId) { return byId.get(ruleId); }

    /** Severity for a rule id; {@code "error"} when the id is unknown, so a missing catalogue
     * entry never silently downgrades a real violation to a warning. */
    public String severity(String ruleId) {
        IpcRuleMeta m = byId.get(ruleId);
        return m == null ? "error" : m.severity();
    }

    public List<IpcRuleMeta> rules() { return List.copyOf(byId.values()); }
    public Map<String, List<IpcKeySpec>> keySchema() { return Map.copyOf(keySchema); }
    public Map<String, String> typeAliases() { return Map.copyOf(typeAliases); }
    public Map<String, String> keyAliases() { return Map.copyOf(keyAliases); }
}
```

- [x] **Step 5: Write `StructuralRules` and `IpcRuleEngine`**

Create `backend/src/main/java/io/pure360/etl360/service/ipc/StructuralRules.java`:

```java
package io.pure360.etl360.service.ipc;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** The {@code IPC-STR-*} family — shape invariants that hold for every recipe (spec §5.4). */
final class StructuralRules {
    private StructuralRules() {}

    /** ScalaType.scala:7 — the nine legal field dataTypes. */
    private static final Set<String> DATA_TYPES = Set.of(
        "String", "BigDecimal", "Long", "Integer", "Timestamp",
        "LocalDateTime", "LocalDate", "Boolean", "Unknown");

    static List<IpcRule> all(IpcCatalog catalog) {
        List<IpcRule> rules = new ArrayList<>();

        rules.add(rule("IPC-STR-001", catalog, (ctx, sev, out) -> {
            JsonNode steps = ctx.recipe().path("steps");
            if (!steps.isArray() || steps.isEmpty()) {
                out.add(IpcCheck.fail("IPC-STR-001", sev, "$.steps", "steps must be a non-empty array"));
            }
        }));

        rules.add(rule("IPC-STR-002", catalog, (ctx, sev, out) -> {
            for (int i = 0; i < ctx.steps().size(); i++) {
                if (!ctx.steps().get(i).path("target").isObject()) {
                    out.add(IpcCheck.fail("IPC-STR-002", sev, ctx.stepPath(i) + ".target",
                        "step target is missing"));
                }
            }
        }));

        rules.add(rule("IPC-STR-003", catalog, (ctx, sev, out) -> {
            for (int i = 0; i < ctx.steps().size(); i++) {
                JsonNode t = ctx.steps().get(i).path("target");
                if (t.isObject() && t.path("name").asText("").isBlank()) {
                    out.add(IpcCheck.fail("IPC-STR-003", sev, ctx.stepPath(i) + ".target.name",
                        "step target is missing a name"));
                }
            }
        }));

        rules.add(rule("IPC-STR-004", catalog, (ctx, sev, out) -> {
            for (int i = 0; i < ctx.steps().size(); i++) {
                JsonNode t = ctx.steps().get(i).path("target");
                if (t.isObject() && t.path("type").asText("").isBlank()) {
                    out.add(IpcCheck.fail("IPC-STR-004", sev, ctx.stepPath(i) + ".target.type",
                        "step target is missing a type"));
                }
            }
        }));

        rules.add(rule("IPC-STR-005", catalog, (ctx, sev, out) -> {
            for (int i = 0; i < ctx.steps().size(); i++) {
                JsonNode t = ctx.steps().get(i).path("target");
                String raw = t.path("type").asText("");
                if (raw.isBlank()) continue; // IPC-STR-004 owns this
                if (!IpcVocabulary.TARGET_TYPES.contains(IpcVocabulary.canonicalTargetType(raw))) {
                    out.add(IpcCheck.fail("IPC-STR-005", sev, ctx.stepPath(i) + ".target.type",
                        "unknown step target type \"" + raw + "\""));
                }
                JsonNode sources = ctx.steps().get(i).path("sources");
                if (!sources.isArray()) continue;
                for (int j = 0; j < sources.size(); j++) {
                    String sraw = sources.get(j).path("type").asText("");
                    if (sraw.isBlank()) continue;
                    if (!IpcVocabulary.SOURCE_TYPES.contains(IpcVocabulary.canonicalSourceType(sraw))) {
                        out.add(IpcCheck.fail("IPC-STR-005", sev,
                            ctx.stepPath(i) + ".sources[" + j + "].type",
                            "unknown step source type \"" + sraw + "\""));
                    }
                }
            }
        }));

        rules.add(rule("IPC-STR-006", catalog, (ctx, sev, out) -> {
            Set<String> seen = new HashSet<>();
            for (int i = 0; i < ctx.steps().size(); i++) {
                String name = ctx.steps().get(i).path("target").path("name").asText("");
                if (name.isBlank()) continue;
                if (!seen.add(name)) {
                    out.add(IpcCheck.fail("IPC-STR-006", sev, ctx.stepPath(i) + ".target.name",
                        "duplicate step target name \"" + name + "\""));
                }
            }
        }));

        rules.add(rule("IPC-STR-007", catalog, (ctx, sev, out) -> {
            for (int i = 0; i < ctx.steps().size(); i++) {
                JsonNode t = ctx.steps().get(i).path("target");
                JsonNode fields = ctx.fieldsOf(t);
                if (!fields.isArray()) continue;
                Set<String> seen = new HashSet<>();
                for (int j = 0; j < fields.size(); j++) {
                    String n = fields.get(j).path("name").asText("");
                    if (n.isBlank()) continue;
                    if (!seen.add(n)) {
                        out.add(IpcCheck.fail("IPC-STR-007", sev,
                            ctx.stepPath(i) + ".target." + ctx.fieldsKey(t) + "[" + j + "].name",
                            "duplicate field name \"" + n + "\""));
                    }
                }
            }
        }));

        rules.add(rule("IPC-STR-008", catalog, (ctx, sev, out) -> {
            for (int i = 0; i < ctx.steps().size(); i++) {
                JsonNode t = ctx.steps().get(i).path("target");
                JsonNode fields = ctx.fieldsOf(t);
                if (!fields.isArray()) continue;
                for (int j = 0; j < fields.size(); j++) {
                    String dt = fields.get(j).path("dataType").asText("");
                    if (dt.isBlank() || DATA_TYPES.contains(dt)) continue;
                    out.add(IpcCheck.fail("IPC-STR-008", sev,
                        ctx.stepPath(i) + ".target." + ctx.fieldsKey(t) + "[" + j + "].dataType",
                        "unknown dataType \"" + dt + "\""));
                }
            }
        }));

        rules.add(rule("IPC-STR-009", catalog, (ctx, sev, out) -> {
            for (int i = 0; i < ctx.steps().size(); i++) {
                JsonNode t = ctx.steps().get(i).path("target");
                JsonNode fields = ctx.fieldsOf(t);
                if (!fields.isArray()) continue;
                for (int j = 0; j < fields.size(); j++) {
                    if (fields.get(j).path("name").asText("").isBlank()) {
                        out.add(IpcCheck.fail("IPC-STR-009", sev,
                            ctx.stepPath(i) + ".target." + ctx.fieldsKey(t) + "[" + j + "]",
                            "field is missing a name"));
                    }
                }
            }
        }));

        return rules;
    }

    /** Small adapter so each rule above reads as a lambda over (ctx, severity, out). */
    @FunctionalInterface
    interface Body { void run(RuleContext ctx, String severity, List<IpcCheck> out); }

    static IpcRule rule(String id, IpcCatalog catalog, Body body) {
        return new IpcRule() {
            @Override public String id() { return id; }
            @Override public void check(RuleContext ctx, List<IpcCheck> out) {
                body.run(ctx, catalog.severity(id), out);
            }
        };
    }
}
```

Create `backend/src/main/java/io/pure360/etl360/service/ipc/IpcRuleEngine.java`:

```java
package io.pure360.etl360.service.ipc;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Runs every registered {@link IpcRule} over a recipe and returns one {@link IpcCheck} per
 * violation plus a synthesized {@code pass} check for each rule that produced none — so a
 * consumer can render "42 checks, 40 passed" without knowing the catalogue.
 */
@Service
public class IpcRuleEngine {
    private final IpcCatalog catalog;
    private final List<IpcRule> rules;

    public IpcRuleEngine(IpcCatalog catalog) {
        this.catalog = catalog;
        List<IpcRule> all = new ArrayList<>();
        all.addAll(StructuralRules.all(catalog));
        this.rules = List.copyOf(all);
    }

    public List<IpcCheck> run(JsonNode recipe) {
        RuleContext ctx = new RuleContext(recipe);
        List<IpcCheck> out = new ArrayList<>();
        for (IpcRule rule : rules) {
            int before = out.size();
            rule.check(ctx, out);
            if (out.size() == before) {
                out.add(IpcCheck.pass(rule.id(), catalog.severity(rule.id())));
            }
        }
        return List.copyOf(out);
    }

    /** Rule ids registered here, for the contract test's parity assertion. */
    public List<String> ruleIds() { return rules.stream().map(IpcRule::id).toList(); }
}
```

- [x] **Step 6: Run the test to verify it passes**

Run: `mvn -am -pl backend test -Dtest=StructuralRulesTest -DfailIfNoTests=false`
Expected: PASS, 10 tests.

- [x] **Step 7: Commit**

```bash
git add backend/src/main/resources/ipc/ipc-rules.json \
        backend/src/main/java/io/pure360/etl360/service/ipc/ \
        backend/src/test/java/io/pure360/etl360/service/ipc/StructuralRulesTest.java \
        docs/superpowers/plans/2026-08-01-etl-modifier-redesign.md
git commit -m "feat(ipc): rule engine skeleton + IPC-STR-* structural family

Task 2. Logic in Java, metadata in classpath ipc-rules.json, IpcCatalog binds them.
Nine structural rules; alias-resolved types and the weststone fields spelling both
pass, unknown types and duplicate names fail."
```

---

### Task 3: Per-kind key schema + `IPC-TYP-*` family

**Files:**
- Modify: `backend/src/main/resources/ipc/ipc-rules.json` (fill `keySchema`, append `IPC-TYP-*` metadata)
- Create: `backend/src/main/java/io/pure360/etl360/service/ipc/TypeShapeRules.java`
- Modify: `backend/src/main/java/io/pure360/etl360/service/ipc/IpcRuleEngine.java:20-24`
- Create: `backend/src/test/java/io/pure360/etl360/service/ipc/TypeShapeRulesTest.java`

**Interfaces:**
- Consumes: `IpcCatalog.keySchema()`, `RuleContext`, `StructuralRules.rule(...)` helper (package-private).
- Produces: `TypeShapeRules.all(IpcCatalog) -> List<IpcRule>`. The `keySchema` map (kind → `IpcKeySpec[]`) is consumed by Task 5's `GET /api/ipc/rules` and by Task 12's Inspector — this task is where the widget assignment per key is decided once.

- [x] **Step 1: Write the failing type-shape test**

Create `backend/src/test/java/io/pure360/etl360/service/ipc/TypeShapeRulesTest.java`:

```java
package io.pure360.etl360.service.ipc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class TypeShapeRulesTest {
    private static final ObjectMapper M = new ObjectMapper();
    private final IpcCatalog catalog = new IpcCatalog();
    private final IpcRuleEngine engine = new IpcRuleEngine(catalog);

    private List<IpcCheck> failures(String json) throws Exception {
        return engine.run(M.readTree(json)).stream().filter(c -> "fail".equals(c.status())).toList();
    }

    private static String recipe(String targetJson) {
        return "{\"steps\":[{\"target\":" + targetJson + ",\"sources\":[]}],"
            + "\"table\":{\"targetTableNames\":[],\"sourceTableNames\":[]}}";
    }

    @Test
    void sourceQualifierWithoutSelectDistinctFails() throws Exception {
        assertThat(failures(recipe("{\"name\":\"SQ\",\"type\":\"sourceQualifier\",\"fields\":[]}")))
            .anyMatch(c -> c.ruleId().equals("IPC-TYP-SOURCEQUALIFIER-001"));
    }

    @Test
    void sourceQualifierWithSelectDistinctPasses() throws Exception {
        assertThat(failures(recipe(
            "{\"name\":\"SQ\",\"type\":\"sourceQualifier\",\"selectDistinct\":false,\"fields\":[]}")))
            .noneMatch(c -> c.ruleId().startsWith("IPC-TYP-SOURCEQUALIFIER-"));
    }

    @Test
    void anonymizedSourceQualifierIsCheckedUnderItsCanonicalKind() throws Exception {
        assertThat(failures(recipe("{\"name\":\"SQ\",\"type\":\"BERYLFALLS\",\"fields\":[]}")))
            .anyMatch(c -> c.ruleId().equals("IPC-TYP-SOURCEQUALIFIER-001"));
    }

    @Test
    void routerWithTwoDefaultGroupsFails() throws Exception {
        String t = """
            {"name":"RTR","type":"router","fields":[],"groups":[
              {"name":"A","default":true,"fields":[]},
              {"name":"B","default":true,"fields":[]}]}""";
        assertThat(failures(recipe(t))).anyMatch(c -> c.ruleId().equals("IPC-TYP-ROUTER-002"));
    }

    @Test
    void routerWithOneDefaultGroupPasses() throws Exception {
        String t = """
            {"name":"RTR","type":"router","fields":[],"groups":[
              {"name":"A","default":true,"fields":[]},
              {"name":"B","default":false,"fields":[]}]}""";
        assertThat(failures(recipe(t))).noneMatch(c -> c.ruleId().startsWith("IPC-TYP-ROUTER-"));
    }

    @Test
    void routerGroupsUnderTheAnonymizedKeyAreStillChecked() throws Exception {
        String t = """
            {"name":"RTR","type":"router","fields":[],"greencliff":[
              {"name":"A","default":true,"fields":[]},
              {"name":"B","default":true,"fields":[]}]}""";
        assertThat(failures(recipe(t))).anyMatch(c -> c.ruleId().equals("IPC-TYP-ROUTER-002"));
    }

    @Test
    void aggregatorWithoutGroupByFieldsFails() throws Exception {
        assertThat(failures(recipe("{\"name\":\"AGG\",\"type\":\"aggregator\",\"fields\":[]}")))
            .anyMatch(c -> c.ruleId().equals("IPC-TYP-AGGREGATOR-001"));
    }

    @Test
    void normalizerWithEmptyRefSourceFails() throws Exception {
        String t = """
            {"name":"NRM","type":"normalizer","fields":[],
             "normalizedFields":[{"name":"N","refSource":[]}]}""";
        assertThat(failures(recipe(t))).anyMatch(c -> c.ruleId().equals("IPC-TYP-NORMALIZER-002"));
    }

    @Test
    void joinerInputNameMustCarryMasterOrDetailSuffix() throws Exception {
        assertThat(failures(recipe("{\"name\":\"JNR_X\",\"type\":\"joinerInput\",\"fields\":[]}")))
            .anyMatch(c -> c.ruleId().equals("IPC-TYP-JOINERINPUT-001"));
        assertThat(failures(recipe("{\"name\":\"JNR_X.DETAIL\",\"type\":\"joinerInput\",\"fields\":[]}")))
            .noneMatch(c -> c.ruleId().equals("IPC-TYP-JOINERINPUT-001"));
    }

    @Test
    void joinerSourceRequiresItsThreeJoinKeys() throws Exception {
        String json = "{\"steps\":[{\"target\":{\"name\":\"T\",\"type\":\"table\",\"fields\":[]},"
            + "\"sources\":[{\"name\":\"J\",\"type\":\"joiner\"}]}],"
            + "\"table\":{\"targetTableNames\":[],\"sourceTableNames\":[]}}";
        assertThat(failures(json)).anyMatch(c -> c.ruleId().equals("IPC-TYP-JOINER-001"));
    }

    @Test
    void keySchemaCoversAllTwentyKinds() {
        assertThat(catalog.keySchema().keySet())
            .containsAll(IpcVocabulary.TARGET_TYPES.stream().map(t -> "target:" + t).toList())
            .containsAll(IpcVocabulary.SOURCE_TYPES.stream().map(t -> "source:" + t).toList());
    }

    @Test
    void everyKeySpecCarriesAWidget() {
        for (var entry : catalog.keySchema().entrySet()) {
            for (IpcCatalog.IpcKeySpec spec : entry.getValue()) {
                assertThat(spec.widget()).as(entry.getKey() + "." + spec.key()).isNotBlank();
            }
        }
    }
}
```

- [x] **Step 2: Run it to verify it fails**

Run: `mvn -am -pl backend test -Dtest=TypeShapeRulesTest -DfailIfNoTests=false`
Expected: FAIL — `TypeShapeRules` missing, `keySchema` empty.

- [x] **Step 3: Fill `keySchema` in `ipc-rules.json`**

Keys are namespaced `target:<kind>` / `source:<kind>` because `table`, `filter`,
`sourceQualifier`, `aggregator`, `router`, `normalizer`, `java` and `storedProcedure` exist
on both sides with different shapes. `widget` is one of `text`, `toggle`, `textarea`,
`stringList`, `rowTable`, `formula`, `fieldTable` (spec §6.4's widget classes). Every kind
carries `name` (text, required) and `type` (text, required); targets additionally carry
`fields` (fieldTable, required). Add the kind-specific entries:

```
target:table          -> primaryKeys (List[String], optional, stringList)
                         updateOverride (Option[String], optional, textarea)
target:unionInput     -> (no extra keys)
target:sourceQualifier-> selectDistinct (Boolean, required, toggle)
                         sourceFilter (Option[String], optional, textarea)
                         sqlQuery (Option[String], optional, textarea)
                         userDefinedJoin (Option[String], optional, textarea)
target:filter         -> filterCondition (RecipeTransformation, optional, formula)
target:joinerInput    -> (no extra keys)
target:aggregator     -> groupByFields (List[String], required, stringList)
target:router         -> groups (List[RouterGroup], required, rowTable)
target:normalizer     -> normalizedFields (List[NormalizedField], required, rowTable)
target:java           -> javaCode (String, required, textarea)
target:storedProcedure-> procedureName (String, required, text)
                         returnField (Option[String], optional, text)
source:table          -> primaryKeys (List[String], optional, stringList)
source:union          -> unionTables (List[UnionTable], required, rowTable)
source:joiner         -> joinerTables (List[String], required, stringList)
                         joinerType (String, required, text)
                         joinerCondition (String, required, textarea)
source:router         -> group (String, required, text)
source:sourceQualifier, source:filter, source:aggregator, source:normalizer,
source:java, source:storedProcedure -> (no extra keys)
```

Transcribed into `ipc-rules.json`, two kinds look like this — follow the same shape for the
other eighteen. `name`, `type` and `fields` carry no `ruleId` (`IPC-STR-003`/`-004` and the
field rules already own them); every other required key carries the exact id that fires when
it is missing, so `TypeShapeRules` reads the id rather than deriving it from array position:

```json
  "keySchema": {
    "target:sourceQualifier": [
      { "key": "name",            "parserType": "String",         "required": true,  "widget": "text" },
      { "key": "type",            "parserType": "String",         "required": true,  "widget": "text" },
      { "key": "fields",          "parserType": "List[Field]",    "required": true,  "widget": "fieldTable" },
      { "key": "selectDistinct",  "parserType": "Boolean",        "required": true,  "widget": "toggle",
        "ruleId": "IPC-TYP-SOURCEQUALIFIER-001" },
      { "key": "sourceFilter",    "parserType": "Option[String]", "required": false, "widget": "textarea" },
      { "key": "sqlQuery",        "parserType": "Option[String]", "required": false, "widget": "textarea" },
      { "key": "userDefinedJoin", "parserType": "Option[String]", "required": false, "widget": "textarea" }
    ],
    "source:joiner": [
      { "key": "name",            "parserType": "String",         "required": true,  "widget": "text" },
      { "key": "type",            "parserType": "String",         "required": true,  "widget": "text" },
      { "key": "joinerTables",    "parserType": "List[String]",   "required": true,  "widget": "stringList",
        "ruleId": "IPC-TYP-JOINER-001" },
      { "key": "joinerType",      "parserType": "String",         "required": true,  "widget": "text",
        "ruleId": "IPC-TYP-JOINER-001" },
      { "key": "joinerCondition", "parserType": "String",         "required": true,  "widget": "textarea",
        "ruleId": "IPC-TYP-JOINER-001" }
    ]
  }
```

Several keys may share one `ruleId` (as the three joiner keys do above) when the rule
statement covers them jointly — the catalogue entry is per rule, not per key.

Append one `IPC-TYP-<KIND>-NNN` rule entry per required key and per structural constraint
below, each with `severity: "error"`, a `parserRef` pointing at the exact `AbstractTarget.scala`
/ `AbstractSource.scala` line from spec §4's tables, and a `wikiRef` of
`docs/ipc/transformations/<kind>.md`. For `ipcRef`, use these verified URLs; leave `ipcRef`
blank for any rule not listed here rather than inventing one — spec §10 criterion 2 requires a
citation only "where an IPC equivalent exists":

| rule | `ipcRef` |
|---|---|
| `IPC-TYP-ROUTER-002` | `https://docs.informatica.com/data-integration/powercenter/10-4-0/transformation-guide/router-transformation/working-with-groups/output-groups/the-default-group.html` |
| `IPC-TYP-ROUTER-001`, `IPC-TYP-ROUTER-003` | `https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/router-transformation/working-with-groups/adding-groups.html` |
| `IPC-TYP-AGGREGATOR-001` | `https://docs.informatica.com/data-integration/powercenter/10-4-0/transformation-guide/aggregator-transformation/group-by-ports.html` |
| `IPC-TYP-JOINER-001` | `https://docs.informatica.com/data-integration/powercenter/10-4-0/transformation-guide/joiner-transformation/defining-a-join-condition.html` |
| `IPC-TYP-JOINERINPUT-001` | `https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/joiner-transformation/joiner-transformation-overview.html` |
| `IPC-TYP-UNION-001` | `https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/union-transformation/working-with-groups-and-ports.html` |
| `IPC-TYP-STOREDPROCEDURE-001` | `https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/stored-procedure-transformation/stored-procedure-transformation-overview/connected-and-unconnected.html` | The ids referenced by
the tests above are: `IPC-TYP-SOURCEQUALIFIER-001` (selectDistinct present and boolean),
`IPC-TYP-ROUTER-001` (groups present and an array), `IPC-TYP-ROUTER-002` (at most one
`default: true`), `IPC-TYP-AGGREGATOR-001` (groupByFields present and an array),
`IPC-TYP-NORMALIZER-001` (normalizedFields present and an array), `IPC-TYP-NORMALIZER-002`
(every `refSource` non-empty), `IPC-TYP-JOINERINPUT-001` (name matches
`^.+\.(MASTER|DETAIL)$`), `IPC-TYP-JAVA-001` (javaCode present),
`IPC-TYP-STOREDPROCEDURE-001` (procedureName present), `IPC-TYP-JOINER-001` (joinerTables,
joinerType and joinerCondition all present), `IPC-TYP-UNION-001` (unionTables present, every
`fieldMapping` entry carrying both `origin` and `union`).

- [x] **Step 4: Write `TypeShapeRules`**

Create `backend/src/main/java/io/pure360/etl360/service/ipc/TypeShapeRules.java`. It has two
halves: a **generic** half that walks `IpcCatalog.keySchema()` and emits a
required-key-present failure for every `required` spec whose key (alias-resolved via
`IpcVocabulary.canonicalKey`) is absent from the node, and a **specific** half for the
constraints that are not "key is present":

```java
package io.pure360.etl360.service.ipc;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

import static io.pure360.etl360.service.ipc.StructuralRules.rule;

/** The {@code IPC-TYP-*} family — per-kind required keys and shape constraints (spec §5.4). */
final class TypeShapeRules {
    private TypeShapeRules() {}

    private static final Pattern JOINER_INPUT_NAME = Pattern.compile("^.+\\.(MASTER|DETAIL)$");

    static List<IpcRule> all(IpcCatalog catalog) {
        List<IpcRule> rules = new ArrayList<>();
        rules.add(requiredKeys(catalog));
        rules.add(rule("IPC-TYP-ROUTER-002", catalog, (ctx, sev, out) ->
            forEachTarget(ctx, "router", (i, target) -> {
                JsonNode groups = keyOf(target, "groups");
                if (!groups.isArray()) return;
                int defaults = 0;
                for (JsonNode g : groups) if (g.path("default").asBoolean(false)) defaults++;
                if (defaults > 1) {
                    out.add(IpcCheck.fail("IPC-TYP-ROUTER-002", sev,
                        ctx.stepPath(i) + ".target.groups",
                        "router has " + defaults + " default groups; IPC allows at most one"));
                }
            })));
        rules.add(rule("IPC-TYP-NORMALIZER-002", catalog, (ctx, sev, out) ->
            forEachTarget(ctx, "normalizer", (i, target) -> {
                JsonNode nf = keyOf(target, "normalizedFields");
                if (!nf.isArray()) return;
                for (int j = 0; j < nf.size(); j++) {
                    JsonNode refSource = nf.get(j).path("refSource");
                    if (!refSource.isArray() || refSource.isEmpty()) {
                        out.add(IpcCheck.fail("IPC-TYP-NORMALIZER-002", sev,
                            ctx.stepPath(i) + ".target.normalizedFields[" + j + "].refSource",
                            "normalized field must reference at least one input field"));
                    }
                }
            })));
        rules.add(rule("IPC-TYP-JOINERINPUT-001", catalog, (ctx, sev, out) ->
            forEachTarget(ctx, "joinerInput", (i, target) -> {
                String name = target.path("name").asText("");
                if (!JOINER_INPUT_NAME.matcher(name).matches()) {
                    out.add(IpcCheck.fail("IPC-TYP-JOINERINPUT-001", sev,
                        ctx.stepPath(i) + ".target.name",
                        "joiner input name must be <joiner>.MASTER or <joiner>.DETAIL, got \""
                            + name + "\""));
                }
            })));
        rules.add(rule("IPC-TYP-UNION-001", catalog, (ctx, sev, out) -> {
            for (int i = 0; i < ctx.steps().size(); i++) {
                JsonNode sources = ctx.steps().get(i).path("sources");
                if (!sources.isArray()) continue;
                for (int j = 0; j < sources.size(); j++) {
                    if (!"union".equals(ctx.sourceType(sources.get(j)))) continue;
                    JsonNode tables = keyOf(sources.get(j), "unionTables");
                    if (!tables.isArray()) continue;
                    for (int k = 0; k < tables.size(); k++) {
                        for (JsonNode fm : tables.get(k).path("fieldMapping")) {
                            if (fm.path("origin").asText("").isBlank()
                                || fm.path("union").asText("").isBlank()) {
                                out.add(IpcCheck.fail("IPC-TYP-UNION-001", sev,
                                    ctx.stepPath(i) + ".sources[" + j + "].unionTables[" + k
                                        + "].fieldMapping",
                                    "every field mapping needs both origin and union"));
                            }
                        }
                    }
                }
            }
        }));
        return rules;
    }

    /** One rule id per required key, driven entirely by the catalogue's key schema. */
    private static IpcRule requiredKeys(IpcCatalog catalog) {
        return new IpcRule() {
            @Override public String id() { return "IPC-TYP-REQUIRED-KEYS"; }
            @Override public void check(RuleContext ctx, List<IpcCheck> out) {
                for (int i = 0; i < ctx.steps().size(); i++) {
                    JsonNode step = ctx.steps().get(i);
                    JsonNode target = step.path("target");
                    if (target.isObject()) {
                        checkNode(catalog, ctx, out, target, "target:" + ctx.targetType(target),
                            ctx.stepPath(i) + ".target");
                    }
                    JsonNode sources = step.path("sources");
                    if (!sources.isArray()) continue;
                    for (int j = 0; j < sources.size(); j++) {
                        JsonNode src = sources.get(j);
                        checkNode(catalog, ctx, out, src, "source:" + ctx.sourceType(src),
                            ctx.stepPath(i) + ".sources[" + j + "]");
                    }
                }
            }
        };
    }

    private static void checkNode(IpcCatalog catalog, RuleContext ctx, List<IpcCheck> out,
                                  JsonNode node, String schemaKey, String path) {
        List<IpcCatalog.IpcKeySpec> specs = catalog.keySchema().get(schemaKey);
        if (specs == null) return; // unknown kind — IPC-STR-005 owns that
        for (IpcCatalog.IpcKeySpec spec : specs) {
            if (!spec.required() || spec.ruleId().isBlank()) continue; // name/type/fields: other rules own them
            if (!keyOf(node, spec.key()).isMissingNode()) continue;
            out.add(IpcCheck.fail(spec.ruleId(), catalog.severity(spec.ruleId()),
                path + "." + spec.key(),
                "required key \"" + spec.key() + "\" is missing for kind " + schemaKey));
        }
    }

    /** Reads a key through the alias table, so {@code greencliff} answers a {@code groups} lookup. */
    private static JsonNode keyOf(JsonNode node, String canonicalKey) {
        JsonNode direct = node.path(canonicalKey);
        if (!direct.isMissingNode()) return direct;
        var it = node.fields();
        while (it.hasNext()) {
            var e = it.next();
            if (canonicalKey.equals(IpcVocabulary.canonicalKey(e.getKey()))) return e.getValue();
        }
        return com.fasterxml.jackson.databind.node.MissingNode.getInstance();
    }

    @FunctionalInterface
    private interface TargetVisitor { void visit(int stepIndex, JsonNode target); }

    private static void forEachTarget(RuleContext ctx, String canonicalKind, TargetVisitor v) {
        for (int i = 0; i < ctx.steps().size(); i++) {
            JsonNode t = ctx.steps().get(i).path("target");
            if (t.isObject() && canonicalKind.equals(ctx.targetType(t))) v.visit(i, t);
        }
    }
}
```

> **Implementer note:** every `IPC-TYP-*` id you put in a `ruleId` field must also have a
> `rules[]` catalogue entry, and vice versa. Task 5's `everyCatalogueRuleIdIsRegistered` checks
> exactly this, so a typo surfaces there rather than at runtime.

- [x] **Step 5: Register the family in `IpcRuleEngine`**

In `IpcRuleEngine`'s constructor, after `all.addAll(StructuralRules.all(catalog));` add:

```java
        all.addAll(TypeShapeRules.all(catalog));
```

- [x] **Step 6: Run the test to verify it passes**

Run: `mvn -am -pl backend test -Dtest=TypeShapeRulesTest -DfailIfNoTests=false`
Expected: PASS, 12 tests.

- [x] **Step 7: Commit**

```bash
git add backend/src/main/resources/ipc/ipc-rules.json \
        backend/src/main/java/io/pure360/etl360/service/ipc/TypeShapeRules.java \
        backend/src/main/java/io/pure360/etl360/service/ipc/IpcRuleEngine.java \
        backend/src/test/java/io/pure360/etl360/service/ipc/TypeShapeRulesTest.java \
        docs/superpowers/plans/2026-08-01-etl-modifier-redesign.md
git commit -m "feat(ipc): per-kind key schema + IPC-TYP-* shape family

Task 3. keySchema namespaces target:/source: (eight kinds exist on both sides with
different shapes) and drives both the required-key rules and Task 12's Inspector.
Keys are read through the alias table, so greencliff answers a groups lookup."
```

---

### Task 4: `IPC-REF-*`, `IPC-FLW-*`, `IPC-EXP-*` families

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/service/ipc/ReferentialRules.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/ipc/DataflowRules.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/ipc/ExpressionRules.java`
- Modify: `backend/src/main/resources/ipc/ipc-rules.json` (append metadata)
- Modify: `backend/src/main/java/io/pure360/etl360/service/ipc/IpcRuleEngine.java`
- Create: `backend/src/test/java/io/pure360/etl360/service/ipc/ReferentialAndFlowRulesTest.java`

**Interfaces:**
- Consumes: `RuleContext`, `StructuralRules.rule(...)`, `IpcCatalog`.
- Produces: `ReferentialRules.all`, `DataflowRules.all`, `ExpressionRules.all`, each `-> List<IpcRule>`.

Rule ids and statements to register in `ipc-rules.json` (all `severity: "error"` for now —
Task 5 calibrates them against the corpus and downgrades whatever the corpus violates):

| id | statement |
|---|---|
| `IPC-REF-001` | every dot-ref `T.F`'s table `T` resolves to a step target, a step source, or a `table.sourceTableNames` entry (case-insensitive) |
| `IPC-REF-002` | when `T` names a step target, `F` must exist among that target's fields |
| `IPC-REF-003` | every `sources[].name` resolves to a step target or a `table.sourceTableNames` entry |
| `IPC-REF-004` | no field may reference its own step |
| `IPC-REF-005` | `table.targetTableNames` contains every `type: "table"` step target name |
| `IPC-REF-006` | the step reference graph is acyclic |
| `IPC-FLW-001` | every non-source step is reachable from at least one source |
| `IPC-FLW-002` | every `table.targetTableNames` entry exists as a step target |
| `IPC-FLW-003` | no orphan step (no inbound refs and no outbound refs) |
| `IPC-FLW-004` | every `EXP_LOOKUP`'s `condition` references at least one of its own `parameters[].name` bind variables |
| `IPC-EXP-001` | call-tree `name` values are `EXP_*` markers or members of `RecipeConstants.PredefinedFunctions` |
| `IPC-EXP-002` | bare `{value}` operator literals belong to the arithmetic/comparison/logical/string operator sets |
| `IPC-EXP-003` | `EXP_LOOKUP.matchPolicy` ∈ `Any \| First \| Last` |

- [x] **Step 1: Write the failing test**

Create `backend/src/test/java/io/pure360/etl360/service/ipc/ReferentialAndFlowRulesTest.java`:

```java
package io.pure360.etl360.service.ipc;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ReferentialAndFlowRulesTest {
    private static final ObjectMapper M = new ObjectMapper();
    private final IpcRuleEngine engine = new IpcRuleEngine(new IpcCatalog());

    private List<String> failedIds(String json) throws Exception {
        return engine.run(M.readTree(json)).stream()
            .filter(c -> "fail".equals(c.status())).map(IpcCheck::ruleId).toList();
    }

    /** Source table S -> sourceQualifier SQ -> target table T. Clean on every family. */
    private static final String CHAIN = """
        {"steps":[
          {"target":{"name":"SQ","type":"sourceQualifier","selectDistinct":false,"fields":[
              {"name":"A","dataType":"String","transformation":{"source":"S.A"}}]},
           "sources":[{"name":"S","type":"table"}]},
          {"target":{"name":"T","type":"table","fields":[
              {"name":"A","dataType":"String","transformation":{"source":"SQ.A"}}]},
           "sources":[{"name":"SQ","type":"sourceQualifier"}]}],
         "table":{"targetTableNames":["T"],"sourceTableNames":["S"]}}""";

    @Test
    void aCleanChainHasNoReferentialOrFlowFailures() throws Exception {
        assertThat(failedIds(CHAIN)).noneMatch(id -> id.startsWith("IPC-REF-") || id.startsWith("IPC-FLW-"));
    }

    @Test
    void unresolvableRefTableFails() throws Exception {
        assertThat(failedIds(CHAIN.replace("\"source\":\"S.A\"", "\"source\":\"NOPE.A\"")))
            .contains("IPC-REF-001");
    }

    @Test
    void refToAMissingFieldOfAKnownStepFails() throws Exception {
        assertThat(failedIds(CHAIN.replace("\"source\":\"SQ.A\"", "\"source\":\"SQ.ZZZ\"")))
            .contains("IPC-REF-002");
    }

    @Test
    void selfReferenceFails() throws Exception {
        assertThat(failedIds(CHAIN.replace("\"source\":\"SQ.A\"", "\"source\":\"T.A\"")))
            .contains("IPC-REF-004");
    }

    @Test
    void targetTableMissingFromTargetTableNamesFails() throws Exception {
        assertThat(failedIds(CHAIN.replace("\"targetTableNames\":[\"T\"]", "\"targetTableNames\":[]")))
            .contains("IPC-REF-005");
    }

    @Test
    void aTwoStepCycleFails() throws Exception {
        String cyclic = """
            {"steps":[
              {"target":{"name":"A","type":"filter","fields":[
                  {"name":"X","dataType":"String","transformation":{"source":"B.X"}}]},"sources":[]},
              {"target":{"name":"B","type":"filter","fields":[
                  {"name":"X","dataType":"String","transformation":{"source":"A.X"}}]},"sources":[]}],
             "table":{"targetTableNames":[],"sourceTableNames":[]}}""";
        assertThat(failedIds(cyclic)).contains("IPC-REF-006");
    }

    @Test
    void unknownExpressionFunctionFails() throws Exception {
        String json = CHAIN.replace("\"transformation\":{\"source\":\"S.A\"}",
            "\"transformation\":{\"name\":\"NOT_A_FUNCTION\",\"parameters\":[{\"source\":\"S.A\"}]}");
        assertThat(failedIds(json)).contains("IPC-EXP-001");
    }

    @Test
    void knownPredefinedFunctionPasses() throws Exception {
        String json = CHAIN.replace("\"transformation\":{\"source\":\"S.A\"}",
            "\"transformation\":{\"name\":\"SUBSTR\",\"parameters\":[{\"source\":\"S.A\"}]}");
        assertThat(failedIds(json)).doesNotContain("IPC-EXP-001");
    }

    @Test
    void expMarkerNamesPass() throws Exception {
        String json = CHAIN.replace("\"transformation\":{\"source\":\"S.A\"}",
            "\"transformation\":{\"name\":\"EXP_DECODE\",\"parameters\":[{\"source\":\"S.A\"}]}");
        assertThat(failedIds(json)).doesNotContain("IPC-EXP-001");
    }

    @Test
    void badLookupMatchPolicyFails() throws Exception {
        String json = CHAIN.replace("\"transformation\":{\"source\":\"S.A\"}", """
            "transformation":{"name":"EXP_LOOKUP","outputField":"O","table":"L",
              "condition":"K = in_K","matchPolicy":"Maybe",
              "parameters":[{"name":"in_K","dataType":"String","transformation":{"source":"S.A"}}]}""");
        assertThat(failedIds(json)).contains("IPC-EXP-003");
    }

    @Test
    void lookupConditionNotReferencingABindVariableFails() throws Exception {
        String json = CHAIN.replace("\"transformation\":{\"source\":\"S.A\"}", """
            "transformation":{"name":"EXP_LOOKUP","outputField":"O","table":"L",
              "condition":"K = 1","matchPolicy":"First",
              "parameters":[{"name":"in_K","dataType":"String","transformation":{"source":"S.A"}}]}""");
        assertThat(failedIds(json)).contains("IPC-FLW-004");
    }
}
```

- [x] **Step 2: Run it to verify it fails**

Run: `mvn -am -pl backend test -Dtest=ReferentialAndFlowRulesTest -DfailIfNoTests=false`
Expected: FAIL — the three rule classes don't exist.

- [x] **Step 3: Implement the three rule classes**

Each follows `StructuralRules`' shape: a `static List<IpcRule> all(IpcCatalog)` returning
`rule(id, catalog, (ctx, sev, out) -> …)` lambdas.

`ReferentialRules` needs a shared dot-ref walk, used by `IPC-REF-001`, `-002`, `-004` and
`-006`:

```java
    /** One field-level dot-ref, tagged with where it landed and its JSON path for error
     * reporting. {@code table}/{@code field} split {@code source} on the FIRST dot only —
     * a field name may itself contain dots (Router group-qualified ports). */
    record Ref(String table, String field, String toStep, String toField, String path) {}

    static List<Ref> collectRefs(RuleContext ctx) { /* … */ }
```

`collectRefs` mirrors the frontend's `collectRefs` (`recipeAdapter.ts:134-165`): descend
every field's `transformation`, splitting `source` on the **first** dot only (a field name may
itself contain dots — Router group-qualified ports), and recursing into `parameters`,
unwrapping Field-shaped parameters via their `.transformation`. `IPC-REF-006`'s cycle check
runs a DFS with an in-progress set over the step graph built from those refs, exactly as
`canvasLayout.computeLayers` (`canvasLayout.ts:32-51`) does.

`ExpressionRules` must hold the `PredefinedFunctions` list copied verbatim from
`RecipeConstants.scala:48-51` (35 entries) and the four operator lists from
`RecipeConstants.scala:54-57`. Add a Javadoc line stating that these are a **copy** of the
Scala constants and must be updated together; Task 6's contract test asserts the copy has the
same cardinality as the Scala source by counting the quoted literals in
`RecipeConstants.scala`.

- [x] **Step 4: Register all three families in `IpcRuleEngine`**

```java
        all.addAll(ReferentialRules.all(catalog));
        all.addAll(DataflowRules.all(catalog));
        all.addAll(ExpressionRules.all(catalog));
```

- [x] **Step 5: Run the test to verify it passes**

Run: `mvn -am -pl backend test -Dtest=ReferentialAndFlowRulesTest -DfailIfNoTests=false`
Expected: PASS, 11 tests.

- [x] **Step 6: Commit**

```bash
git add backend/src/main/java/io/pure360/etl360/service/ipc/ReferentialRules.java \
        backend/src/main/java/io/pure360/etl360/service/ipc/DataflowRules.java \
        backend/src/main/java/io/pure360/etl360/service/ipc/ExpressionRules.java \
        backend/src/main/java/io/pure360/etl360/service/ipc/IpcRuleEngine.java \
        backend/src/main/resources/ipc/ipc-rules.json \
        backend/src/test/java/io/pure360/etl360/service/ipc/ReferentialAndFlowRulesTest.java \
        docs/superpowers/plans/2026-08-01-etl-modifier-redesign.md
git commit -m "feat(ipc): referential, dataflow and expression rule families

Task 4. IPC-REF-002 adds the field half of dot-ref resolution the old validator never
checked; IPC-REF-006 detects cycles with the same in-progress DFS canvasLayout uses.
Expression vocabulary is a documented copy of RecipeConstants.scala:48-57."
```

---

### Task 5: Severity calibration + extended validate + `GET /api/ipc/rules`

**Files:**
- Create: `backend/src/test/java/io/pure360/etl360/IpcRulesContractTest.java`
- Modify: `backend/src/main/resources/ipc/ipc-rules.json` (severities after calibration)
- Modify: `backend/src/main/java/io/pure360/etl360/api/dto/RecipeValidationDto.java`
- Create: `backend/src/main/java/io/pure360/etl360/api/dto/IpcCheckDto.java`, `IpcRuleMetaDto.java`, `IpcKeySpecDto.java`, `IpcRulesDto.java`
- Create: `backend/src/main/java/io/pure360/etl360/api/IpcController.java`
- Modify: `backend/src/main/java/io/pure360/etl360/service/RecipeService.java:177-220`
- Modify: `frontend/src/api/types.gen.ts` (regenerated)
- Modify: `frontend/src/api/queries.ts`

**Interfaces:**
- Consumes: `IpcRuleEngine.run`, `IpcCatalog`.
- Produces: `RecipeValidationDto(boolean valid, List<RecipeValidationErrorDto> errors, List<RecipeValidationErrorDto> warnings, List<IpcCheckDto> checks)`; `GET /api/ipc/rules -> IpcRulesDto(List<IpcRuleMetaDto> rules, Map<String,String> typeAliases, Map<String,String> keyAliases, Map<String,List<IpcKeySpecDto>> keySchema)`; frontend aliases `IpcRules`, `IpcCheck`, `IpcKeySpec` in `queries.ts`.

- [x] **Step 1: Write the failing corpus-calibration contract test**

Create `backend/src/test/java/io/pure360/etl360/IpcRulesContractTest.java`:

```java
package io.pure360.etl360;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.pure360.etl360.service.CorpusService;
import io.pure360.etl360.service.ipc.IpcCatalog;
import io.pure360.etl360.service.ipc.IpcCheck;
import io.pure360.etl360.service.ipc.IpcRuleEngine;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class IpcRulesContractTest {
    @Autowired CorpusService corpus;
    @Autowired IpcRuleEngine engine;
    @Autowired IpcCatalog catalog;
    private final ObjectMapper mapper = new ObjectMapper();

    /** Spec §5.4's invariant: the committed corpus is error-free under the whole catalogue. */
    @Test
    void everyCorpusRecipeIsErrorFree() throws Exception {
        List<String> recipes = corpus.allRecipePaths();
        assertThat(recipes).hasSizeGreaterThanOrEqualTo(86);
        List<String> offenders = new ArrayList<>();
        for (String rel : recipes) {
            var content = mapper.readTree(
                Files.readString(Path.of("../parser/src/main/resources/xmltobq").resolve(rel)));
            for (IpcCheck c : engine.run(content)) {
                if ("fail".equals(c.status()) && "error".equals(c.severity())) {
                    offenders.add(rel + " " + c.ruleId() + " @" + c.path() + ": " + c.message());
                }
            }
        }
        assertThat(offenders).as("corpus recipes violating an error-severity rule").isEmpty();
    }

    @Test
    void everyRegisteredRuleIdHasCatalogueMetadata() {
        for (String id : engine.ruleIds()) {
            assertThat(catalog.meta(id)).as("catalogue entry for " + id).isNotNull();
        }
    }

    @Test
    void everyCatalogueRuleIdIsRegistered() {
        java.util.Set<String> implemented = new java.util.HashSet<>(engine.ruleIds());
        // IPC-TYP-* required-key ids are emitted by the shared IPC-TYP-REQUIRED-KEYS rule via
        // the key schema's ruleId fields rather than being registered individually, so the
        // schema's ids count as implemented too.
        catalog.keySchema().values().forEach(specs -> specs.forEach(s -> {
            if (!s.ruleId().isBlank()) implemented.add(s.ruleId());
        }));
        for (IpcCatalog.IpcRuleMeta meta : catalog.rules()) {
            assertThat(implemented).as("rule " + meta.id() + " is implemented").contains(meta.id());
        }
    }

    /** The reverse direction: a ruleId in the key schema with no catalogue entry would emit
     * checks carrying no severity, statement or citation. */
    @Test
    void everyKeySchemaRuleIdHasCatalogueMetadata() {
        catalog.keySchema().forEach((kind, specs) -> specs.forEach(s -> {
            if (s.ruleId().isBlank()) return;
            assertThat(catalog.meta(s.ruleId()))
                .as("catalogue entry for " + kind + "." + s.key() + " -> " + s.ruleId()).isNotNull();
        }));
    }

    @Test
    void everyRuleCitesTheParser() {
        for (IpcCatalog.IpcRuleMeta meta : catalog.rules()) {
            assertThat(meta.parserRef()).as(meta.id() + " parserRef").isNotBlank();
            assertThat(meta.severity()).as(meta.id() + " severity").isIn("error", "warning", "info");
        }
    }
}
```

- [x] **Step 2: Run it and record the calibration output**

Run: `mvn -am -pl backend test -Dtest=IpcRulesContractTest -DfailIfNoTests=false`
Expected: FAIL — `everyCorpusRecipeIsErrorFree` lists real corpus violations. **Capture the
full offender list into the task's RED evidence; it is the input to the next step.**

- [x] **Step 3: Calibrate severities**

For each distinct rule id in the offender list, first **categorise the violations
structurally** — group them by what construct they actually landed on, and count how many
resist any explanation, by collecting offenders into a list and counting/printing it
directly (never by reading an AssertJ assertion-failure printout: its default
`maxElementsForPrinting` silently truncates at 1000 elements with no "…and N more" marker,
and this task's first pass was fooled by exactly that). That count is what decides the
branch, and skipping this step is how a rule bug gets mistaken for a loose corpus — it
happened TWICE on this task, and the second time invalidated an already-shipped decision
that had looked sound on a coarser check:

- **The rule is WRONG — fix the logic, keep `severity: "error"`.** Symptom: the violations
  decompose cleanly into one or more legitimate constructs the rule simply does not model,
  with ~zero unexplained residue. The rule is firing on things it was never meant to judge.
  Completing its vocabulary is not weakening it, and the fix must ship with a test proving a
  genuinely bad input still fails. Worked example: `IPC-EXP-001` flagged 569 call-tree names,
  but categorising them gave 1326 Lookup nodes (identifiable by carrying `outputField` —
  `RecipeTransformation.scala:15`), 32 `SequenceGenerator` and 2 `Undefined` (both
  `RecipeConstants.scala` markers), and **zero** genuinely unknown functions. Fixed, not
  downgraded.
- **Anonymizer damage — extend the alias table, keep `severity: "error"`.** Extend
  `IpcVocabulary` with an XML witness and cover it in `AliasWitnessContractTest`.
- **The corpus is genuinely loose — downgrade to `severity: "warning"`, with an evidence
  string that describes only what actually remains.** Symptom: a real unexplained residue
  after fixing whatever the rule turns out to be missing — not before. `IPC-REF-002` is the
  cautionary tale here: an initial spot-check (working from the SAME truncated 1000-element
  printout) reported ~1037 "unexplained" misses and the downgrade looked sound. A structural
  re-analysis found the opposite — the check had compared a Router's group-qualified field
  half against group/port names WITHOUT splitting it into `<group>.<port>` first, so every
  Router case (the actual dominant pattern, ~92% of the true 1096-violation total) fell
  through to "unexplained" by construction. Fixing `IPC-REF-002` to resolve Router
  group-qualified ports, Normalizer `normalizedFields`, and storedProcedure `returnField`
  (the same "complete the vocabulary" move as `IPC-EXP-001`) collapsed 1096 violations to 28
  — and THAT smaller residue (a paired-Lookup encoding quirk shared with `IPC-REF-006`, two
  Normalizer GENERATED KEY/COLUMN ID name losses, one parser-dropped java output field) is
  genuine: each is data the parser itself never put in the recipe JSON, not a key this rule
  wasn't checking. `IPC-REF-002` stayed at `warning`, but for a different and much smaller
  reason than first believed. Moral: categorise BEFORE deciding, re-verify a
  reviewer-or-self-supplied count before enshrining it in `corpusEvidence` (Task 6 copies
  that string verbatim into permanent documentation), and treat your own earlier
  acceptance of a downgrade as non-binding once better evidence exists.

Re-run until `everyCorpusRecipeIsErrorFree` passes. Do **not** delete a rule to make the test
pass, and do **not** weaken a rule's logic so it stops firing — the logic describes what IPC
means, the severity describes what this corpus happens to contain. If you find yourself
downgrading most of the catalogue, stop and escalate: that means the rules are wrong, not the
corpus.

- [x] **Step 4: Extend the validation DTO and wire the engine into `RecipeService.validate`**

Replace `RecipeValidationDto`:

```java
package io.pure360.etl360.api.dto;

import java.util.List;

/**
 * Response of {@code POST /api/recipes/validate}. {@code valid} remains
 * {@code errors.isEmpty()} — warnings never block a save (spec §5.5) — so pre-existing
 * consumers ({@code scripts/recipe_sweep.mts}, Tab 2's save path) are unaffected.
 */
public record RecipeValidationDto(boolean valid,
                                  List<RecipeValidationErrorDto> errors,
                                  List<RecipeValidationErrorDto> warnings,
                                  List<IpcCheckDto> checks) {}
```

Create `IpcCheckDto`:

```java
package io.pure360.etl360.api.dto;

public record IpcCheckDto(String ruleId, String severity, String status, String path, String message) {}
```

In `RecipeService`, inject `IpcRuleEngine` and rewrite `validate` to delegate.

> **Breaking-change warning:** `RecipeService`'s constructor is today `RecipeService(PathResolver)`
> and `RecipeServiceTest:8-9` constructs it directly with `new RecipeService(new PathResolver(...))`.
> Adding a second parameter breaks that test's compilation. Update it in this step to
> `new RecipeService(new PathResolver(...), new IpcRuleEngine(new IpcCatalog()))` — do **not**
> field-inject to dodge the signature change; the explicit constructor is the pattern every
> other service here follows.

Keep the
"not a JSON object" and "steps must be a non-empty array" early returns so a malformed body
still produces the same two error shapes, then map the engine's checks:

```java
    public RecipeValidationDto validate(JsonNode recipe) {
        if (recipe == null || !recipe.isObject()) {
            var e = List.of(new RecipeValidationErrorDto("$", "Recipe is not a JSON object"));
            return new RecipeValidationDto(false, e, List.of(), List.of());
        }
        List<IpcCheck> checks = engine.run(recipe);
        List<RecipeValidationErrorDto> errors = new ArrayList<>();
        List<RecipeValidationErrorDto> warnings = new ArrayList<>();
        List<IpcCheckDto> dtos = new ArrayList<>();
        for (IpcCheck c : checks) {
            dtos.add(new IpcCheckDto(c.ruleId(), c.severity(), c.status(), c.path(), c.message()));
            if (!"fail".equals(c.status())) continue;
            var err = new RecipeValidationErrorDto(c.path(), c.ruleId() + ": " + c.message());
            if ("error".equals(c.severity())) errors.add(err); else warnings.add(err);
        }
        return new RecipeValidationDto(errors.isEmpty(), errors, warnings, dtos);
    }
```

Delete the now-dead private helpers `collectRefTargets` and `collectDotRefErrors` from
`RecipeService` — `ReferentialRules` owns that logic now.

- [x] **Step 5: Add `IpcController` and its DTOs**

```java
package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.IpcKeySpecDto;
import io.pure360.etl360.api.dto.IpcRuleMetaDto;
import io.pure360.etl360.api.dto.IpcRulesDto;
import io.pure360.etl360.service.ipc.IpcCatalog;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Serves the IPC conformance catalogue so the GUI can explain a failing check and derive
 * the Inspector's per-kind key schema without hardcoding a second copy of the grammar. */
@RestController
@RequestMapping("/api/ipc")
public class IpcController {
    private final IpcCatalog catalog;

    public IpcController(IpcCatalog catalog) { this.catalog = catalog; }

    @GetMapping("/rules")
    public IpcRulesDto rules() {
        List<IpcRuleMetaDto> rules = catalog.rules().stream()
            .map(m -> new IpcRuleMetaDto(m.id(), m.severity(), m.statement(),
                m.parserRef(), m.ipcRef(), m.wikiRef()))
            .toList();
        Map<String, List<IpcKeySpecDto>> schema = new LinkedHashMap<>();
        catalog.keySchema().forEach((kind, specs) -> schema.put(kind, specs.stream()
            .map(s -> new IpcKeySpecDto(s.key(), s.parserType(), s.required(), s.widget(), s.ruleId()))
            .toList()));
        return new IpcRulesDto(rules, catalog.typeAliases(), catalog.keyAliases(), schema);
    }
}
```

Create the three record DTOs (`IpcRuleMetaDto(String id, String severity, String statement,
String parserRef, String ipcRef, String wikiRef)`, `IpcKeySpecDto(String key, String
parserType, boolean required, String widget, String ruleId)`, `IpcRulesDto(List<IpcRuleMetaDto> rules,
Map<String,String> typeAliases, Map<String,String> keyAliases,
Map<String,List<IpcKeySpecDto>> keySchema)`).

- [x] **Step 6: Regenerate the frontend types and add the query hook**

Run in one terminal: `make dev` (or `mvn -am -pl backend install -DskipTests && mvn -pl backend spring-boot:run`).
Then: `make generate-api`

Add to `frontend/src/api/queries.ts`:

```ts
export type IpcRules = components['schemas']['IpcRulesDto']
export type IpcRuleMeta = components['schemas']['IpcRuleMetaDto']
export type IpcKeySpec = components['schemas']['IpcKeySpecDto']
export type IpcCheck = components['schemas']['IpcCheckDto']

export const useIpcRules = () =>
  useQuery({ queryKey: ['ipcRules'], queryFn: () => apiGet<IpcRules>('/ipc/rules'), staleTime: Infinity })
```

- [x] **Step 7: Run every gate and commit**

Run: `mvn -q -am -pl backend test`
Expected: PASS, including `IpcRulesContractTest`.
Run: `cd frontend && npx tsc --noEmit && pnpm test`
Expected: PASS.

```bash
git add backend/src/main/resources/ipc/ipc-rules.json \
        backend/src/main/java/io/pure360/etl360/api/IpcController.java \
        backend/src/main/java/io/pure360/etl360/api/dto/ \
        backend/src/main/java/io/pure360/etl360/service/RecipeService.java \
        backend/src/test/java/io/pure360/etl360/IpcRulesContractTest.java \
        frontend/src/api/types.gen.ts frontend/src/api/queries.ts \
        docs/superpowers/plans/2026-08-01-etl-modifier-redesign.md
git commit -m "feat(ipc): calibrate severities against the corpus, extend validate, serve the catalogue

Task 5. validate now delegates to IpcRuleEngine and returns warnings[] + checks[]
alongside the unchanged valid/errors contract. Severities calibrated by spec §5.4's
procedure so all 86 corpus recipes are error-free. GET /api/ipc/rules serves rule
metadata, alias table and the per-kind key schema."
```

---

### Task 6: Wiki completion — per-kind pages, `rules.md`, `expressions.md`, three-way parity

**Files:**
- Create: `docs/ipc/rules.md`, `docs/ipc/expressions.md`
- Create: `docs/ipc/transformations/<kind>.md` × 11 (`table`, `unionInput`, `sourceQualifier`, `filter`, `joinerInput`, `aggregator`, `router`, `normalizer`, `java`, `storedProcedure`, `union`)
- Modify: `backend/src/test/java/io/pure360/etl360/IpcRulesContractTest.java`

**Interfaces:**
- Consumes: `IpcCatalog.rules()`, `docs/ipc/README.md` (Task 1).
- Produces: the wiki `rules.md` anchors that every `wikiRef` points at.

- [x] **Step 1: Write the failing three-way parity test**

Append to `IpcRulesContractTest`:

```java
    @Test
    void everyRuleIsDocumentedInTheWiki() throws Exception {
        String rulesMd = Files.readString(Path.of("../docs/ipc/rules.md"));
        for (IpcCatalog.IpcRuleMeta meta : catalog.rules()) {
            assertThat(rulesMd).as("docs/ipc/rules.md documents " + meta.id()).contains(meta.id());
        }
    }

    @Test
    void everyWikiRefResolvesToAFileThatExists() throws Exception {
        for (IpcCatalog.IpcRuleMeta meta : catalog.rules()) {
            String ref = meta.wikiRef();
            if (ref.isBlank()) continue;
            String file = ref.contains("#") ? ref.substring(0, ref.indexOf('#')) : ref;
            assertThat(Files.isRegularFile(Path.of("..").resolve(file)))
                .as(meta.id() + " wikiRef -> " + file).isTrue();
        }
    }

    @Test
    void everyKindHasAWikiPage() {
        for (String kind : IpcVocabulary.TARGET_TYPES) {
            assertThat(Files.isRegularFile(Path.of("../docs/ipc/transformations/" + kind + ".md")))
                .as("wiki page for target kind " + kind).isTrue();
        }
        assertThat(Files.isRegularFile(Path.of("../docs/ipc/transformations/union.md")))
            .as("wiki page for source kind union").isTrue();
    }

    /**
     * Exact set equality, not just cardinality: a same-count rename in RecipeConstants.scala
     * would otherwise drift past this test silently. backend does depend on parser
     * (backend/pom.xml:44), so the Scala object IS on the classpath — the Java copy is kept
     * deliberately to keep Scala 2.12 collection interop out of the backend, and this test is
     * what makes the copy safe (human ruling, pre-flight scan 2026-08-01).
     */
    @Test
    void expressionVocabularyMatchesTheScalaConstants() throws Exception {
        String scala = Files.readString(
            Path.of("../parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/RecipeConstants.scala"));
        String block = scala.substring(scala.indexOf("PredefinedFunctions"),
            scala.indexOf("final val GlobalTransformationExclusionList"));
        java.util.Set<String> fromScala = new java.util.LinkedHashSet<>();
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("\"([A-Z_0-9]+)\"").matcher(block);
        while (m.find()) fromScala.add(m.group(1));
        assertThat(fromScala).as("regex found the function list").hasSizeGreaterThan(30);
        assertThat(ExpressionRules.PREDEFINED_FUNCTIONS)
            .as("Java copy of RecipeConstants.scala:48-52 matches the Scala source exactly")
            .containsExactlyInAnyOrderElementsOf(fromScala);
    }
```

Add the imports this needs (`io.pure360.etl360.service.ipc.IpcVocabulary`,
`io.pure360.etl360.service.ipc.ExpressionRules`) and widen `ExpressionRules` +
`PREDEFINED_FUNCTIONS` from package-private to `public` so the test in package
`io.pure360.etl360` can read them.

- [x] **Step 2: Run it to verify it fails**

Run: `mvn -am -pl backend test -Dtest=IpcRulesContractTest -DfailIfNoTests=false`
Expected: FAIL — `docs/ipc/rules.md` does not exist.

- [x] **Step 3: Write `docs/ipc/rules.md`**

One `### <RULE-ID>` section per catalogue entry, in id order, each carrying: the `statement`
verbatim from `ipc-rules.json`, **Severity**, **Parser** (the `parserRef` as a markdown link),
**IPC** (the `ipcRef` link, or "no direct IPC equivalent — this is a parser-model
invariant"), and — for every rule Task 5 downgraded — a **Corpus evidence** line copied from
that rule's `corpusEvidence` field explaining why it is a warning rather than an error.

- [x] **Step 4: Write the eleven `docs/ipc/transformations/*.md` pages**

Each page has five `##` sections: **What IPC says** (cited, with the `ipcRef` URL);
**What the parser emits** (the case class with its `file:line`, and the exact JSON keys);
**Recipe JSON shape** (a fenced example taken verbatim from a real corpus recipe, path cited);
**Corpus occurrences** (the count from spec §4's tables, plus the anonymized token if the kind
has one); **Rules** (a list of the `IPC-TYP-<KIND>-*` ids that apply, linking into `rules.md`).

- [x] **Step 5: Write `docs/ipc/expressions.md`**

Covers the four-way `RecipeTransformation` union (`RecipeTransformation.scala:6-22`) with the
JSON shape of each; the `EXP_LOOKUP` variant and how its `parameters` are Field-shaped rather
than transformation-shaped (`recipeAdapter.ts:130` discriminates on this); the 35
`PredefinedFunctions` and four operator sets from `RecipeConstants.scala:48-57`; and the
formula rendering contract from `renderFormula` (`recipeAdapter.ts:180-194`) — `{name,
parameters}` → `NAME(p1, p2, …)`, `{source}` → the dot-ref **verbatim**, `{value}` → verbatim.

- [x] **Step 6: Run the test to verify it passes**

Run: `mvn -am -pl backend test -Dtest=IpcRulesContractTest -DfailIfNoTests=false`
Expected: PASS.

- [x] **Step 7: Run the whole backend suite and commit**

Run: `mvn -q -am -pl backend test`
Expected: PASS.

```bash
git add docs/ipc/ backend/src/test/java/io/pure360/etl360/IpcRulesContractTest.java \
        backend/src/main/java/io/pure360/etl360/service/ipc/ExpressionRules.java \
        docs/superpowers/plans/2026-08-01-etl-modifier-redesign.md
git commit -m "docs(ipc): complete the wiki — per-kind pages, rules.md, expressions.md

Task 6. Three-way parity is now enforced: every registered rule has catalogue
metadata, every catalogue rule is documented in rules.md, every wikiRef resolves to a
real file, and the PredefinedFunctions copy is size-checked against RecipeConstants.scala."
```

---

# Part 2 — canvas & editor

### Task 7: Fix the 0px canvas collapse

**Files:**
- Modify: `frontend/src/components/tab2/ETLModifier.tsx:926`
- Modify: `frontend/src/components/tab2/ETLModifier.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing — behavior-only fix. Tasks 8+ build on a canvas that is actually visible.

- [x] **Step 1: Write the failing regression test**

Append inside the existing top-level `describe` in `ETLModifier.test.tsx`:

```tsx
  it('mounts the canvas inside a flex container so EtlCanvas flex:1 resolves to a real height', async () => {
    renderModifier()
    fireEvent.click(await screen.findByText('_ETL_m_FIX.json'))
    const nodeText = await screen.findByText('T', { selector: 'text' })

    // Walk up from the rendered node to the fixed-height canvas host and assert every
    // ancestor between them participates in flex layout. EtlCanvas's root is `flex: 1`
    // with absolutely-positioned children, so a non-flex parent collapses it to 0px and
    // the canvas renders invisibly (the original bug: "Canvas (2 nodes)" over an empty box).
    const svg = nodeText.closest('svg')!
    const canvasRoot = svg.parentElement!            // EtlCanvas root div (flex: 1)
    const host = canvasRoot.parentElement!           // the height:420 wrapper
    expect(host.style.height).toBe('420px')
    expect(host.style.display).toBe('flex')
  })
```

- [x] **Step 2: Run it to verify it fails**

Run: `cd frontend && pnpm test src/components/tab2/ETLModifier.test.tsx`
Expected: FAIL — `expect(host.style.display).toBe('flex')` receives `''`.

- [x] **Step 3: Apply the one-line fix**

In `ETLModifier.tsx:926`, change:

```tsx
              <div style={{ height: 420, border: '1px solid var(--border)', borderRadius: 8, position: 'relative', overflow: 'hidden' }}>
```

to:

```tsx
              {/* display:flex is load-bearing: EtlCanvas's root is `flex: 1` with every
                  child absolutely positioned, so a block parent collapses it to 0px and
                  the canvas renders invisibly. */}
              <div style={{ height: 420, display: 'flex', border: '1px solid var(--border)', borderRadius: 8, position: 'relative', overflow: 'hidden' }}>
```

- [x] **Step 4: Run the test to verify it passes**

Run: `cd frontend && pnpm test src/components/tab2/ETLModifier.test.tsx`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/tab2/ETLModifier.tsx \
        frontend/src/components/tab2/ETLModifier.test.tsx \
        docs/superpowers/plans/2026-08-01-etl-modifier-redesign.md
git commit -m "fix(modifier): canvas collapsed to 0px behind a block parent

Task 7. EtlCanvas roots at flex:1 with absolutely-positioned children, so the
height:420 block wrapper gave it no height at all — the section header truthfully
reported 'Canvas (2 nodes)' above an empty box. Regression test asserts the host is
a flex container."
```

---

### Task 8: `IpcCanvas` — bands, node drag, edge hit areas

**Files:**
- Create: `frontend/src/components/tab2/IpcCanvas.tsx`
- Create: `frontend/src/components/tab2/IpcCanvas.test.tsx`
- Modify: `frontend/src/components/tab2/ETLModifier.tsx` (swap `EtlCanvas` → `IpcCanvas`, add offsets state)

**Interfaces:**
- Consumes: `NodeBox`, `getNodeHeight`, `getPortY`, `buildPath`, `NODE_WIDTH` from `../tab1/NodeBox`; `ETLNode`, `Connection`, `Port` from `../../types`.
- Produces:

```ts
export type Band = 'sources' | 'transformations' | 'target'
export function bandOf(node: ETLNode): Band
export function IpcCanvas(props: {
  nodes: ETLNode[]
  connections: Connection[]
  selectedNode: string | null
  onSelectNode: (id: string) => void
  offsets: Record<string, { x: number; y: number }>
  onMoveNode?: (id: string, x: number, y: number) => void
  onAutoLayout?: () => void
  onPortClick?: (nodeId: string, port: Port) => void
  onSelectEdge?: (conn: Connection) => void
  selectedEdge?: Connection | null
  onDropType?: (type: string) => void
  nodeStatus?: Record<string, 'ok' | 'warn' | 'error'>
}): React.ReactElement
```

`bandOf` derives from `node.type`: `'source'` → `sources`, `'target'` → `target`, everything
else → `transformations` (spec §6.2 — membership follows the data, never drop position).

- [x] **Step 1: Write the failing canvas test**

Create `frontend/src/components/tab2/IpcCanvas.test.tsx` covering: the three band labels
render; `bandOf` classifies a `source`/`expression`/`target` node correctly; a pointer
drag (`pointerDown` on the node group, `pointerMove`, `pointerUp` on the canvas root) calls
`onMoveNode` with grid-snapped coordinates; a node renders at `x + offsets[id].x`; clicking
the auto-layout button calls `onAutoLayout`; each connection renders two `<path>` elements
(a visible one and a transparent `strokeWidth="12"` hit area) and clicking the hit area calls
`onSelectEdge`. Use `container.querySelectorAll('path[stroke-width="12"]')` to find hit areas.

- [x] **Step 2: Run it to verify it fails**

Run: `cd frontend && pnpm test src/components/tab2/IpcCanvas.test.tsx`
Expected: FAIL — `IpcCanvas` does not exist.

- [x] **Step 3: Write `IpcCanvas.tsx`**

Start from `EtlCanvas.tsx` as the structural template (pan/zoom/dot-grid/zoom-controls are
carried over verbatim) and add four things. **Do not edit `EtlCanvas.tsx`** — Tab 1 depends on
it unchanged.

1. **Bands.** Before the connection layer, render one `<g>` per band containing a `<rect>`
   spanning the band's member-node extents (`min(x)-24` → `max(x + NODE_WIDTH)+24`, full
   canvas height) filled `rgba(42,48,80,0.18)` with a `1px` `var(--border-subtle)` edge, plus a
   `<text>` label at the band's top-left in `#4a5570`, 10px, JetBrains Mono, uppercase,
   letter-spacing `0.08em`. Skip a band entirely when it has no members.
2. **Offsets.** Every node renders at `n.x + (offsets[n.id]?.x ?? 0)`, `n.y + (offsets[n.id]?.y ?? 0)`.
   Compute a `positioned` array once and use it for bands, node placement and edge endpoints
   so the three can never disagree.
3. **Drag.** On the node `<g>`, `onPointerDown` captures the pointer, records the grab offset
   and sets `dragging.current = {id, dx, dy}`; the canvas root's `onPointerMove` computes the
   new position in SVG user units (divide client deltas by `zoom`), snaps with
   `Math.round(v / 10) * 10`, and calls `onMoveNode(id, x, y)`; `onPointerUp` clears it. Guard
   the existing pan handler so it ignores events while a node drag is active.
4. **Edge hit areas.** For each connection emit the visible `<path>` plus, immediately before
   it, `<path d={same} fill="none" stroke="transparent" strokeWidth={12} onClick={…} style={{ cursor: 'pointer' }} />`.

Add an `⌗ auto-layout` button next to the existing zoom controls, styled exactly like them
(28×28, `var(--surface)`, `1px solid var(--border)`, `#7b88aa`).

- [x] **Step 4: Run the test to verify it passes**

Run: `cd frontend && pnpm test src/components/tab2/IpcCanvas.test.tsx`
Expected: PASS.

- [x] **Step 5: Swap Tab 2 onto `IpcCanvas`**

In `ETLModifier.tsx`: replace the `EtlCanvas` import with `IpcCanvas`, add
`const [offsets, setOffsets] = useState<Record<string, { x: number; y: number }>>({})`,
reset it to `{}` inside the existing recipe-load `useEffect` (keyed on `recipePath` +
`rec.data?.modifiedAt`), and pass `offsets`, `onMoveNode={(id, x, y) => setOffsets(o => ({ ...o, [id]: { x, y } }))}`
and `onAutoLayout={() => setOffsets({})}`.

- [x] **Step 6: Run the Tab 2 suite and type-check**

Run: `cd frontend && pnpm test && npx tsc --noEmit`
Expected: PASS — including Task 7's flex regression test, unchanged.

- [x] **Step 7: Commit**

```bash
git add frontend/src/components/tab2/IpcCanvas.tsx \
        frontend/src/components/tab2/IpcCanvas.test.tsx \
        frontend/src/components/tab2/ETLModifier.tsx \
        docs/superpowers/plans/2026-08-01-etl-modifier-redesign.md
git commit -m "feat(modifier): banded, draggable IpcCanvas for Tab 2

Task 8. New Tab-2-only component; EtlCanvas and NodeBox untouched so Tab 1 and its
81/81 viewer sweep stay byte-identical. Bands derive from node kind, never from drop
position. Edges gain transparent 12px hit strokes — the 1px paths were unclickable,
which made the existing edge-delete affordance unreachable."
```

---

### Task 9: Layout sidecar backend

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/service/support/LayoutSidecar.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/LayoutService.java`
- Create: `backend/src/main/java/io/pure360/etl360/api/LayoutController.java`
- Create: `backend/src/main/java/io/pure360/etl360/api/dto/LayoutDto.java`, `NodeOffsetDto.java`
- Modify: `backend/src/main/java/io/pure360/etl360/service/CorpusService.java:34-45`
- Create: `backend/src/test/java/io/pure360/etl360/api/LayoutControllerTest.java`

**Interfaces:**
- Consumes: `PathResolver.insideCorpus`, `HistorySidecar` (as the structural template).
- Produces: `LayoutSidecar.PREFIX = "_layout_"`, `LayoutSidecar.isLayoutFile(String fileName) -> boolean`, `LayoutSidecar.layoutFileFor(Path recipeFile) -> Path`; `GET`/`PUT /api/layouts/{*path}` returning `LayoutDto(int version, Map<String, NodeOffsetDto> nodes)`.

- [x] **Step 1: Write the failing controller test**

Create `backend/src/test/java/io/pure360/etl360/api/LayoutControllerTest.java`, modelled on
`RecipeWriteControllerTest`'s `@DynamicPropertySource` temp-corpus idiom. Cover: `GET` for a
recipe with no sidecar returns 200 with `{"version":1,"nodes":{}}` (never 404); `PUT` then
`GET` round-trips positions; the file lands at `CDM/m_FIX/_layout_m_FIX.json`; `GET /api/tree`
never lists it; `GET /api/ddl/CDM/m_FIX` does not include it; a sandbox-escaping path
(`../../etc/passwd.json`) returns 400.

- [x] **Step 2: Run it to verify it fails**

Run: `mvn -am -pl backend test -Dtest=LayoutControllerTest -DfailIfNoTests=false`
Expected: FAIL — classes missing.

- [x] **Step 3: Write `LayoutSidecar`**

```java
package io.pure360.etl360.service.support;

import java.nio.file.Path;

/**
 * Canvas-layout sidecar rules: {@code <mappingDir>/_layout_<mapping>.json} holds node
 * positions for the recipe {@code <mappingDir>/_ETL_<mapping>.json}.
 *
 * <p>Positions deliberately do NOT live inside the recipe: the parser never emits x/y, so
 * embedding them would make {@code make regen-corpus} diff on every recipe and break
 * CLAUDE.md hard rule 3 (ADR-0011). Like {@code _history/}, the sidecar is committable but
 * excluded from every corpus walk.
 */
public final class LayoutSidecar {
    public static final String PREFIX = "_layout_";
    private static final String RECIPE_PREFIX = "_ETL_";
    private static final String JSON_EXT = ".json";

    private LayoutSidecar() {}

    public static boolean isLayoutFile(String fileName) {
        return fileName.startsWith(PREFIX) && fileName.endsWith(JSON_EXT);
    }

    /** {@code …/_ETL_m_FOO.json} -> {@code …/_layout_m_FOO.json}. */
    public static Path layoutFileFor(Path recipeFile) {
        String name = recipeFile.getFileName().toString();
        String stem = name.startsWith(RECIPE_PREFIX) ? name.substring(RECIPE_PREFIX.length()) : name;
        return recipeFile.resolveSibling(PREFIX + stem);
    }
}
```

- [x] **Step 4: Write `LayoutService`, `LayoutController` and the DTOs**

`LayoutDto(int version, Map<String, NodeOffsetDto> nodes)`, `NodeOffsetDto(double dx, double dy)`.

> **The stored values are OFFSETS, not absolute coordinates** — deltas added to whatever
> `layoutNodes` computes for a node (`IpcCanvas` renders each node at `n.x + offsets[id].dx`).
> This is deliberate: the auto-layout algorithm stays authoritative for structure and a drag is
> a nudge on top of it, so adding a node to a recipe re-layouts cleanly while the user's tweaks
> survive. The fields are named `dx`/`dy` rather than `x`/`y` precisely so nobody reads them as
> canvas coordinates — Task 8's implementer flagged that exact ambiguity. Say this in
> `NodeOffsetDto`'s Javadoc too, and in ADR-0011 (Task 18).
`LayoutService.layout(String relRecipePath)` resolves via `paths.insideCorpus`, derives the
sidecar with `LayoutSidecar.layoutFileFor`, and returns `new LayoutDto(1, Map.of())` when the
file is absent. `LayoutService.save(String relRecipePath, LayoutDto body)` writes atomically
using the same temp-file + `ATOMIC_MOVE` idiom as `RecipeService.writeAtomic`
(`RecipeService.java:269-277`). Reject a `relRecipePath` that doesn't end `.json` or whose
basename doesn't start `_ETL_` with `InvalidCorpusPathException`, mirroring
`RecipeService.writableRecipeFile` (`RecipeService.java:227-240`).

`LayoutController`: `@RequestMapping("/api/layouts")`, `@GetMapping("/{*path}")` and
`@PutMapping("/{*path}")`, both calling `MappingController.stripLeadingSlash(path)` exactly as
`RecipeController` does.

- [x] **Step 5: Exclude the sidecar from the tree walk**

In `CorpusService.dirNode`, change the `.json` leaf branch:

```java
                } else if (name.endsWith(".json")) {
                    // Canvas-layout sidecar (see LayoutSidecar): editor state, never a
                    // browsable corpus entry — same exclusion contract as _history/.
                    if (LayoutSidecar.isLayoutFile(name)) continue;
                    children.add(leaf(p, "json"));
                }
```

Add the import. `RecipeService.ddls` (`RecipeService.java:77`) already skips every
`_`-prefixed name, and `allRecipePaths()` matches `_ETL_`, so neither needs a change — the
Step 1 test asserts both rather than assuming them.

- [x] **Step 6: Run the test to verify it passes**

Run: `mvn -am -pl backend test -Dtest=LayoutControllerTest -DfailIfNoTests=false`
Expected: PASS.

- [x] **Step 7: Run the whole backend suite and commit**

Run: `mvn -q -am -pl backend test`
Expected: PASS — `TreeControllerTest`, `CorpusContractTest` and `RecipeAndDdlControllerTest` all still green.

```bash
git add backend/src/main/java/io/pure360/etl360/service/support/LayoutSidecar.java \
        backend/src/main/java/io/pure360/etl360/service/LayoutService.java \
        backend/src/main/java/io/pure360/etl360/api/LayoutController.java \
        backend/src/main/java/io/pure360/etl360/api/dto/LayoutDto.java \
        backend/src/main/java/io/pure360/etl360/api/dto/NodeOffsetDto.java \
        backend/src/main/java/io/pure360/etl360/service/CorpusService.java \
        backend/src/test/java/io/pure360/etl360/api/LayoutControllerTest.java \
        docs/superpowers/plans/2026-08-01-etl-modifier-redesign.md
git commit -m "feat(layouts): _layout_*.json sidecar API, excluded from every corpus walk

Task 9. Positions live beside the recipe rather than inside it so parser output stays
byte-identical (ADR-0011). GET never 404s — an absent sidecar is an empty layout."
```

---

### Task 10: Layout sidecar wiring in Tab 2

**Files:**
- Create: `frontend/src/api/layoutQueries.ts`
- Modify: `frontend/src/api/types.gen.ts` (regenerated)
- Modify: `frontend/src/components/tab2/ETLModifier.tsx`
- Create: `frontend/src/api/layoutQueries.test.ts`
- Modify: `frontend/src/components/tab2/ETLModifier.test.tsx`

**Interfaces:**
- Consumes: `GET`/`PUT /api/layouts/{*path}` (Task 9), `IpcCanvas`'s `offsets`/`onMoveNode`/`onAutoLayout` (Task 8).
- Produces: `useLayout(recipePath: string)` (TanStack query, `enabled: !!recipePath`), `putLayout(recipePath: string, offsets: Record<string, {dx: number; dy: number}>): Promise<Layout>`, and `type Layout = components['schemas']['LayoutDto']`.

- [x] **Step 1: Regenerate types and write the failing tests**

With the backend running, `make generate-api`. Then write `layoutQueries.test.ts` (MSW:
`useLayout` returns `{version:1,nodes:{}}` for an unsaved recipe; `putLayout` PUTs the offsets
map) and append to `ETLModifier.test.tsx`: after loading the recipe and dragging a node, MSW
captures a `PUT /api/layouts/CDM/m_FIX/_ETL_m_FIX.json` whose body carries that node's
snapped position; and a recipe whose `GET /api/layouts/...` returns saved positions renders its
node at the offset position.

- [x] **Step 2: Run to verify they fail**

Run: `cd frontend && pnpm test src/api/layoutQueries.test.ts src/components/tab2/ETLModifier.test.tsx`
Expected: FAIL — `layoutQueries` missing.

- [x] **Step 3: Write `layoutQueries.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend } from './client'
import type { components } from './types.gen'

export type Layout = components['schemas']['LayoutDto']
export type NodeOffset = components['schemas']['NodeOffsetDto']

/** Node positions for a recipe. An unsaved layout is `{version:1,nodes:{}}`, never a 404 —
 * see LayoutService, so this hook has no "missing" state to handle. */
export const useLayout = (recipePath: string) =>
  useQuery({
    queryKey: ['layout', recipePath],
    queryFn: () => apiGet<Layout>(`/layouts/${recipePath}`),
    staleTime: 30_000,
    enabled: !!recipePath,
  })

export const putLayout = (recipePath: string, nodes: Record<string, { dx: number; dy: number }>) =>
  apiSend<Layout>('PUT', `/layouts/${recipePath}`, { version: 1, nodes })
```

- [x] **Step 4: Wire it into `ETLModifier`**

Seed `offsets` from `useLayout(recipePath ?? '')` when its data lands (same `useEffect` that
resets on recipe change, so a fresh recipe never inherits the previous one's positions).
`onMoveNode` updates local state **and** fires a 500 ms-debounced `putLayout`; `onAutoLayout`
clears state and PUTs `{}`. Keep the debounce timer in a `useRef` and clear it on unmount so a
pending write can't fire against a stale path.

- [x] **Step 5: Run to verify they pass**

Run: `cd frontend && pnpm test && npx tsc --noEmit`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add frontend/src/api/layoutQueries.ts frontend/src/api/layoutQueries.test.ts \
        frontend/src/api/types.gen.ts frontend/src/components/tab2/ETLModifier.tsx \
        frontend/src/components/tab2/ETLModifier.test.tsx \
        docs/superpowers/plans/2026-08-01-etl-modifier-redesign.md
git commit -m "feat(modifier): persist canvas node positions to the layout sidecar

Task 10. Drag writes debounced 500ms; auto-layout clears both local state and the
sidecar. Offsets reset on recipe change so a new recipe never inherits stale positions."
```

---

### Task 11: Extract `SaveBar` and `DDLViewer` from `ETLModifier.tsx` (pure move)

**Files:**
- Create: `frontend/src/components/tab2/SaveBar.tsx`, `frontend/src/components/tab2/DDLViewer.tsx`
- Modify: `frontend/src/components/tab2/ETLModifier.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `export function SaveBar(props)` with today's exact prop list (`changes`, `wireFrom`, `onCancelWire`, `onSave`, `onDiscard`); `export function DDLViewer({ cols }: { cols: DdlColumnJson[] })`; `export interface DdlColumnJson { name?, type?, mode?, description? }`; and the shared style constants `dangerButtonStyle`, `ghostButtonStyle` re-exported from `SaveBar.tsx` (Task 12 and Task 13 both use them).

- [x] **Step 1: Move the code**

Cut `SaveBar` (`ETLModifier.tsx:60-124`) with `dangerButtonStyle`/`ghostButtonStyle`
(`:46-55`) into `SaveBar.tsx`; cut `DDLViewer` (`:172-210`) and `DdlColumnJson` (`:34-39`)
into `DDLViewer.tsx`. **Byte-identical bodies** — no restyling, no prop changes, no
behavior change. Import them back into `ETLModifier.tsx`.

- [x] **Step 2: Verify nothing changed**

Run: `cd frontend && pnpm test && npx tsc --noEmit`
Expected: PASS with **zero test edits**. If any Tab 2 test needed changing, the move was not
pure — revert and redo.

- [x] **Step 3: Commit**

```bash
git add frontend/src/components/tab2/SaveBar.tsx frontend/src/components/tab2/DDLViewer.tsx \
        frontend/src/components/tab2/ETLModifier.tsx \
        docs/superpowers/plans/2026-08-01-etl-modifier-redesign.md
git commit -m "refactor(modifier): extract SaveBar and DDLViewer (pure move)

Task 11. ETLModifier.tsx was 1059 lines before the Inspector lands on top of it.
Bodies are byte-identical and no test changed."
```

---

### Task 12: Schema-driven Inspector

**Files:**
- Create: `frontend/src/components/tab2/InspectorWidgets.tsx`, `frontend/src/components/tab2/Inspector.tsx`
- Create: `frontend/src/components/tab2/Inspector.test.tsx`
- Modify: `frontend/src/api/recipeEdits.ts`
- Modify: `frontend/src/api/recipeEdits.test.ts`
- Modify: `frontend/src/components/tab2/ETLModifier.tsx` (replace `EditPanel`)

**Interfaces:**
- Consumes: `useIpcRules()` (Task 5), `RecipeJson`/`RecipeStepJson`/`RecipeFieldJson`, `renderFormula`/`parseFormulaText`, `fieldsOf`.
- Produces:
  - In `recipeEdits.ts`: `setTargetProperty(d: RecipeJson, stepName: string, key: string, value: unknown): RecipeJson`, `deleteTargetProperty(d, stepName, key)`, `setSourceProperty(d, stepName, sourceName, key, value)`. All immutable, all resolving the step by `target.name`.
  - In `InspectorWidgets.tsx`: `TextWidget`, `ToggleWidget`, `TextareaWidget`, `StringListWidget`, `RowTableWidget`, `FormulaWidget` — each `({ label, value, onChange })`.
  - In `Inspector.tsx`: `export function Inspector({ draft, node, keySchema, onChange, onDelete, onFocusFormula })`.

- [x] **Step 1: Write the failing mutator tests**

Append to `recipeEdits.test.ts`: `setTargetProperty` sets a scalar, an array and a nested
object without mutating the input; `deleteTargetProperty` removes a key; `setSourceProperty`
targets the right `sources[]` entry by name; each returns a new object (assert
`result !== input` and `input` is unchanged).

- [x] **Step 2: Run to verify they fail, then implement the mutators**

Run: `cd frontend && pnpm test src/api/recipeEdits.test.ts` → FAIL.
Implement following the file's existing immutable idiom (map/spread, never mutate). Then
re-run → PASS.

- [x] **Step 3: Write the failing Inspector test**

Create `Inspector.test.tsx`. Feed it a fixed `keySchema` literal (do not hit the network —
the component takes `keySchema` as a prop) and assert per widget class:
- `target:sourceQualifier` renders a **toggle** for `selectDistinct` and flipping it calls
  `onChange` with `setTargetProperty(..., 'selectDistinct', true)`'s result shape.
- `target:aggregator` renders a **string list** for `groupByFields`; adding an entry appends.
- `target:router` renders a **row table** for `groups` with columns `name`, `filterCondition`,
  `default`.
- `target:java` renders a **textarea** for `javaCode`.
- `target:filter` renders a **formula** field for `filterCondition`.
- A key present on the node but absent from the schema (`"someAnonymizedKey": 42`) renders in
  an **"Unrecognized keys"** group, read-only.
- A `router` node whose groups live under the anonymized `greencliff` key still renders the
  row table (the Inspector resolves keys through `keyAliases` from `useIpcRules`).

- [x] **Step 4: Run to verify it fails**

Run: `cd frontend && pnpm test src/components/tab2/Inspector.test.tsx`
Expected: FAIL — `Inspector` does not exist.

- [x] **Step 5: Write `InspectorWidgets.tsx` then `Inspector.tsx`**

Widgets reuse the existing input styling from `EditableField`/`FieldEditor`
(`ETLModifier.tsx:143-153, 286-298`) verbatim — `var(--surface-2)` background,
`1px solid var(--border)`, `#c8d3e8` text, 11–12px, JetBrains Mono for mono fields, blue
focus border `#4f9cf9`. `ToggleWidget` is a two-state pill using `--green` when on and
`--border` when off. `StringListWidget` is a column of rows each with a text input and a `×`
button, plus an "+ add" row reusing `AddFieldControl`'s idiom (`ETLModifier.tsx:343-371`).
`RowTableWidget` takes a `columns: {key, label, widget}[]` descriptor and renders the same
grid header/row styling as `DDLViewer`.

`Inspector` looks up `keySchema['target:' + canonicalType]` for the selected node, renders
`name` first, then each spec's widget in schema order, then the field table, then the
unrecognized-keys group, then the delete control (moved from `DeleteNodeControl`). It commits
through `onChange(next: RecipeJson)` — the parent keeps owning `draft` and the dirty counter.

- [x] **Step 6: Replace `EditPanel` in `ETLModifier.tsx`**

Delete `EditPanel`, `FieldEditor`, `AddFieldControl` and `DeleteNodeControl` from
`ETLModifier.tsx` once `Inspector` covers them, and render `<Inspector …>` in their place,
passing `keySchema={ipcRules.data?.keySchema ?? {}}`.

- [x] **Step 7: Run every frontend gate**

Run: `cd frontend && pnpm test && npx tsc --noEmit`
Expected: PASS. Existing Tab 2 tests that drove the old `EditPanel` will need their queries
updated to the Inspector's labels — that is expected and in scope for this task.

- [x] **Step 8: Commit**

```bash
git add frontend/src/components/tab2/Inspector.tsx \
        frontend/src/components/tab2/InspectorWidgets.tsx \
        frontend/src/components/tab2/Inspector.test.tsx \
        frontend/src/components/tab2/ETLModifier.tsx \
        frontend/src/components/tab2/ETLModifier.test.tsx \
        frontend/src/api/recipeEdits.ts frontend/src/api/recipeEdits.test.ts \
        docs/superpowers/plans/2026-08-01-etl-modifier-redesign.md
git commit -m "feat(modifier): schema-driven Inspector covering every recipe key

Task 12. Widgets are chosen by the backend key schema, so the GUI holds no second copy
of the recipe grammar. Keys resolve through the alias table (greencliff renders as
router groups) and any key absent from the schema renders read-only rather than
vanishing on save."
```

---

### Task 13: Conformance chip + drawer

**Files:**
- Create: `frontend/src/api/ipcRules.ts`, `frontend/src/api/ipcRules.test.ts`
- Create: `frontend/src/components/tab2/ConformanceChip.tsx`, `ConformanceChip.test.tsx`
- Modify: `frontend/src/components/tab2/ETLModifier.tsx`, `frontend/src/components/tab2/IpcCanvas.tsx`

**Interfaces:**
- Consumes: `POST /api/recipes/validate` (Task 5), `useIpcRules`, `IpcCanvas`'s `nodeStatus` prop (Task 8).
- Produces: `useValidation(draft: RecipeJson | null)` returning `{ checks, errors, warnings, isValidating }` with a 400 ms debounce, and `nodeStatusFrom(checks: IpcCheck[], graph: CanvasGraph): Record<string, 'ok'|'warn'|'error'>` mapping a check's `$.steps[i]…` path to a node id.

> **Ruled deviation from spec §6.5 (human ruling, pre-flight scan 2026-08-01):** the spec's
> local TypeScript mirror of the `IPC-STR-*` rules is **dropped**. It would have maintained
> nine rules twice in two languages with nothing binding the implementations together, for a
> latency saving that is single-digit milliseconds against a localhost backend. The chip runs
> solely off the debounced `POST /api/recipes/validate`. Record this in spec §13.

- [x] **Step 1: Write the failing tests**

`ipcRules.test.ts`: `useValidation` debounces — two rapid draft changes produce one POST;
`nodeStatusFrom` maps `$.steps[1].target.name` to the second step's target node id and picks
`error` over `warn` when a node has both, and returns `{}` for an empty check list.
`ConformanceChip.test.tsx`: renders green with "0 errors" for a clean validate response; red
with the error count when validate returns errors; clicking opens a drawer listing rule id,
path and message; clicking a drawer row calls `onSelectNode` with the resolved node id.

- [x] **Step 2: Run to verify they fail, then implement**

Run: `cd frontend && pnpm test src/api/ipcRules.test.ts src/components/tab2/ConformanceChip.test.tsx` → FAIL, then implement and re-run → PASS.

Chip colors: `--green` for zero errors and zero warnings, `#fbbf24` (the existing SaveBar
warning amber, `ETLModifier.tsx:101`) when warnings but no errors, `--red` when errors —
all three already in use in this file.

- [x] **Step 3: Wire the chip into the recipe header and node dots into the canvas**

Render `<ConformanceChip …>` in the header button row beside `{ history }` and
`{ raw JSON }`. Pass `nodeStatus={nodeStatusFrom(checks, graph)}` to `IpcCanvas`, and in
`IpcCanvas` render a 6px status dot in each node header (`--green`/`#fbbf24`/`--red`),
omitted entirely when the node has no status.

- [x] **Step 4: Run every frontend gate and commit**

Run: `cd frontend && pnpm test && npx tsc --noEmit`
Expected: PASS.

```bash
git add frontend/src/api/ipcRules.ts frontend/src/api/ipcRules.test.ts \
        frontend/src/components/tab2/ConformanceChip.tsx \
        frontend/src/components/tab2/ConformanceChip.test.tsx \
        frontend/src/components/tab2/ETLModifier.tsx \
        frontend/src/components/tab2/IpcCanvas.tsx \
        docs/superpowers/plans/2026-08-01-etl-modifier-redesign.md
git commit -m "feat(modifier): IPC conformance chip, drawer and per-node status dots

Task 13. The full catalogue runs debounced against POST /api/recipes/validate; spec
§6.5's local TypeScript rule mirror was dropped by ruling (nine rules maintained twice
across two languages, for a localhost latency saving of single-digit ms). Drawer rows
select the offending node on the canvas."
```

---

### Task 14: Recipe-only scoping — expression dock, Explorer filter, info copy

**Files:**
- Create: `frontend/src/components/tab2/ExpressionDock.tsx`, `ExpressionDock.test.tsx`
- Modify: `frontend/src/components/shared/Sidebar.tsx`, `Sidebar.test.tsx`
- Modify: `frontend/src/components/tab2/ETLModifier.tsx`, `ETLModifier.test.tsx`

**Interfaces:**
- Consumes: `useExpressions()`, `InfoTooltip`, `Inspector`'s `onFocusFormula`.
- Produces: `Sidebar` gains `fileFilter?: (f: FSFile) => boolean` and `footer?: React.ReactNode` (the latter consumed by Task 16); `ExpressionDock` exposes drag payload `text/etl-formula`.

- [x] **Step 1: Write the failing tests**

`Sidebar.test.tsx`: with a `fileFilter` keeping only `_ETL_*.json`, XML entries are absent and
a directory whose every child was filtered out is not rendered; with no `fileFilter`, today's
tree renders unchanged (guards Tab 1).
`ExpressionDock.test.tsx`: only `origin: 'recipe'` entries render when both origins are
supplied; a row is `draggable` and its `dragstart` sets `text/etl-formula`; the filter box
narrows the list; Insert fires `onInsert` only when a formula field has focus.
`ETLModifier.test.tsx`: Tab 2's tree shows `_ETL_m_FIX.json` and not the sibling XML; the
Explorer header exposes the info affordance whose text names both `_ETL_*.json` and the IPC
ETL Viewer tab.

- [x] **Step 2: Run to verify they fail**

Run: `cd frontend && pnpm test src/components/shared/Sidebar.test.tsx src/components/tab2/ExpressionDock.test.tsx src/components/tab2/ETLModifier.test.tsx`
Expected: FAIL.

- [x] **Step 3: Implement**

In `Sidebar.tsx`, thread `fileFilter` through `TreeItem`: a file returns `null` when
`fileFilter?.(file) === false`; a directory returns `null` when every child rendered `null`
(compute the children array first, then bail if it is empty). Add the optional `footer` slot
rendered after `extraContent`.

`ExpressionDock.tsx` is today's `ExpressionRegistry` (`ETLModifier.tsx:465-543`) relocated
into a right-side dock beside the `Palette`, with `entries` pre-filtered to
`e.origin === 'recipe'` and each row gaining `draggable` +
`onDragStart={e => e.dataTransfer.setData('text/etl-formula', entry.formula ?? '')}`. Drop
handlers on the Inspector's formula fields and on `IpcCanvas` route to the existing
`parseFormulaText` → `setFieldTransformation` path. Because only recipe-origin entries render,
the `OriginBadge` is no longer discriminating — drop it and keep the layer chip.

Tab 2 passes `fileFilter={f => f.name.startsWith('_ETL_') && f.name.endsWith('.json')}` and an
`InfoTooltip` in the Explorer header with the spec §6.8 copy. Use the same copy in the
"Select an _ETL_*.json recipe to edit" empty state (`ETLModifier.tsx:837`).

- [x] **Step 4: Run every frontend gate and commit**

Run: `cd frontend && pnpm test && npx tsc --noEmit`
Expected: PASS — Tab 1's `Sidebar` tests unchanged.

```bash
git add frontend/src/components/tab2/ExpressionDock.tsx \
        frontend/src/components/tab2/ExpressionDock.test.tsx \
        frontend/src/components/shared/Sidebar.tsx \
        frontend/src/components/shared/Sidebar.test.tsx \
        frontend/src/components/tab2/ETLModifier.tsx \
        frontend/src/components/tab2/ETLModifier.test.tsx \
        docs/superpowers/plans/2026-08-01-etl-modifier-redesign.md
git commit -m "feat(modifier): scope Tab 2 to recipes — expression dock, Explorer filter, info copy

Task 14. The Modifier's premise is the post-parse agnostic model, so XML-origin
formulas and .xml tree entries both belong to Tab 1. Sidebar's fileFilter is opt-in,
so Tabs 1 and 4 are untouched."
```

---

### Task 15: Focus mode

**Files:**
- Modify: `frontend/src/App.tsx`, `frontend/src/components/tab2/ETLModifier.tsx`
- Create: `frontend/src/App.test.tsx` (or extend if present)

**Interfaces:**
- Consumes: `ETLModifier`.
- Produces: `ETLModifier` gains `focusRecipe?: string` — when set it skips the Explorer and the tab chrome and loads that recipe directly.

- [x] **Step 1: Write the failing test**

Set `window.history.replaceState({}, '', '/?focus=CDM/m_FIX/_ETL_m_FIX.json')`, render `App`,
and assert: the tab bar is absent, the Explorer is absent, and the recipe header renders
`_ETL_m_FIX.json`. A second test with no query param asserts the normal four-tab shell.

- [x] **Step 2: Run to verify it fails, then implement**

In `App.tsx`, read `new URLSearchParams(window.location.search).get('focus')` once into
state. When non-null, render `<ETLModifier searchQuery="" focusRecipe={focus} />` alone inside
the existing app shell div, skipping `TopBar` and the tab strip. In `ETLModifier`, when
`focusRecipe` is set, seed `recipePath` from it and render neither `<Sidebar>` nor the
"select a recipe" empty state.

Add a `⤢` button beside `{ history }` in the recipe header calling
`window.open(`?focus=${encodeURIComponent(recipePath)}`, '_blank')`.

- [x] **Step 3: Run every frontend gate and commit**

Run: `cd frontend && pnpm test && npx tsc --noEmit`
Expected: PASS.

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx \
        frontend/src/components/tab2/ETLModifier.tsx \
        docs/superpowers/plans/2026-08-01-etl-modifier-redesign.md
git commit -m "feat(modifier): focus mode via ?focus=<recipePath>

Task 15. Isolated full-viewport editor in a second browser tab, no router dependency.
Cross-tab save races are already covered by the existing baseModified 409."
```

---

# Part 3 — shell chrome

### Task 16: View-aware corpus summary

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/api/SummaryController.java`, `api/dto/SummaryDto.java`
- Modify: `backend/src/main/java/io/pure360/etl360/service/CorpusService.java`
- Create: `backend/src/test/java/io/pure360/etl360/api/SummaryControllerTest.java`
- Create: `frontend/src/components/shared/CorpusSummary.tsx`, `CorpusSummary.test.tsx`
- Modify: `frontend/src/api/queries.ts`, `types.gen.ts`, and the four tab components

**Interfaces:**
- Consumes: `CorpusService`, `useOperational(selectedDate)` (already loaded by Tab 3, `ETLOperational.tsx:262`).
- Produces: `GET /api/summary -> SummaryDto(int xmlCount, int recipeCount, int ddlCount, int dirCount, List<String> layers)`; `useSummary()`; `<CorpusSummary items={[{label, value}]} />`.

- [x] **Step 1: Write the failing backend test**

`SummaryControllerTest` (MockMvc, real corpus): `GET /api/summary` is 200 with
`xmlCount >= 81`, `recipeCount >= 86`, `ddlCount > 0`, and `layers` containing `CDM` and
`DWH`; and `_layout_*.json` / `_history/` contents are excluded from `ddlCount`.

- [x] **Step 2: Run to verify it fails, then implement**

Add `CorpusService.summary()` reusing `allXmlPaths()`/`allRecipePaths()` and a `collect(".json")`
pass filtered to names that neither start with `_` nor are layout sidecars. `layers` is the
sorted set of first path segments. Re-run → PASS.

- [x] **Step 3: Write the failing frontend test and implement `CorpusSummary`**

`CorpusSummary.test.tsx`: renders each `{label, value}` pair as `value label` in mono 10px;
renders nothing when `items` is empty. Then place it per spec §7.1:
- Tabs 1 and 2 → `Sidebar`'s new `footer` slot (Task 14).
- Tab 4 → `DagExplorer`'s footer (`ETLDag.tsx:25,89`).
- Tab 3 → a floating chip absolutely positioned bottom-left of the graph body, because Tab 3's
  only side panel is the **right-hand** detail panel (`ETLOperational.tsx:393-396`, `borderLeft`).

Tab 3's numbers derive from the already-loaded `useOperational(selectedDate)` snapshot: b15 row
count, distinct recipes, distinct tables, and the OK/KO split.

- [x] **Step 4: Run all gates and commit**

Run: `mvn -q -am -pl backend test && cd frontend && pnpm test && npx tsc --noEmit`
Expected: PASS.

```bash
git add backend/src/main/java/io/pure360/etl360/api/SummaryController.java \
        backend/src/main/java/io/pure360/etl360/api/dto/SummaryDto.java \
        backend/src/main/java/io/pure360/etl360/service/CorpusService.java \
        backend/src/test/java/io/pure360/etl360/api/SummaryControllerTest.java \
        frontend/src/components/shared/CorpusSummary.tsx \
        frontend/src/components/shared/CorpusSummary.test.tsx \
        frontend/src/api/queries.ts frontend/src/api/types.gen.ts \
        frontend/src/components/tab1/ETLViewer.tsx \
        frontend/src/components/tab2/ETLModifier.tsx \
        frontend/src/components/tab3/ETLOperational.tsx \
        frontend/src/components/tab4/ETLDag.tsx \
        docs/superpowers/plans/2026-08-01-etl-modifier-redesign.md
git commit -m "feat(chrome): view-aware corpus summary in all four tabs

Task 16. Docks into each tab's existing left rail; Tab 3 has no left rail (its 300px
panel is the right-hand detail panel) so it gets a floating bottom-left chip, and its
counts follow the selected date from the snapshot it already loads."
```

> **Scope note:** this task edits `ETLViewer.tsx` — permitted by the Global Constraints, which
> allow exactly two `ETLViewer.tsx` edits (this footer and Task 17's loading state). Its canvas
> usage, node rendering and detail panel must not change; `git diff frontend/src/components/tab1/`
> should show only the footer addition.

---

### Task 17: Shared loading states

**Files:**
- Create: `frontend/src/components/shared/Spinner.tsx`, `Spinner.test.tsx`
- Modify: all four tab components, `ETLModifier.tsx`, `main.tsx`

**Interfaces:**
- Produces: `<Spinner size?: number />`, `<LoadingState label: string />`, `<TopProgressBar />` (driven by `useIsFetching()` from `@tanstack/react-query`).

- [ ] **Step 1: Write the failing test**

`Spinner.test.tsx`: `LoadingState` renders its label and an SVG with `role="status"`;
`TopProgressBar` renders nothing when `useIsFetching()` is 0 and a bar when it is > 0.

- [ ] **Step 2: Run to verify it fails, then implement**

An SVG arc rotating via CSS `@keyframes` added to `index.css` — an animation utility, not a
new token. Replace every textual `Loading …` (`ETLModifier.tsx:808,841,498`,
`ETLViewer.tsx:116`, and the Tab 3/4 equivalents) with `<LoadingState label="…" />` keeping
each label's current wording. Add an inline `<Spinner size={11} />` to the Save button while
`handleSave` is in flight, and disable it. Mount `<TopProgressBar />` once in `App.tsx`.

- [ ] **Step 3: Run all gates and commit**

Run: `cd frontend && pnpm test && npx tsc --noEmit`
Expected: PASS.

```bash
git add frontend/src/components/shared/Spinner.tsx \
        frontend/src/components/shared/Spinner.test.tsx \
        frontend/src/index.css frontend/src/App.tsx \
        frontend/src/components/tab1/ETLViewer.tsx \
        frontend/src/components/tab2/ETLModifier.tsx \
        frontend/src/components/tab3/ETLOperational.tsx \
        frontend/src/components/tab4/ETLDag.tsx \
        docs/superpowers/plans/2026-08-01-etl-modifier-redesign.md
git commit -m "feat(chrome): shared spinner replacing textual loading states

Task 17. One LoadingState idiom across all four tabs, an inline spinner on Save while
in flight, and a top progress bar driven by useIsFetching()."
```

---

### Task 18: Sweep extension, docs, ADRs, acceptance walk

**Files:**
- Modify: `scripts/recipe_sweep.mts`
- Modify: `CLAUDE.md`, `docs/architecture.md`, `frontend/AGENTS.md`
- Create: `docs/adr/0010-ipc-conformance-ruleset.md`, `docs/adr/0011-canvas-layout-sidecar.md`
- Modify: `docs/superpowers/specs/2026-08-01-etl-modifier-redesign-design.md` (§13)

- [ ] **Step 1: Extend `recipe_sweep.mts`**

After the existing `if (!v.valid) throw …` line, add: fail when any `checks[]` entry's
`ruleId` is absent from `GET /api/ipc/rules`, and print a per-run tally of warning-severity
checks so a severity regression is visible in the gate output without failing it. Update the
final `console.log` to report both renders and warning count.

- [ ] **Step 2: Run the full gate**

Run: `make dev` in one terminal, then `make validate-loop` in another.
Expected: all four sweeps green, `recipe_sweep: 86/86 recipes render+validate`.

- [ ] **Step 3: Write ADR-0010 and ADR-0011**

Follow `docs/adr/0000-template.md`. ADR-0010 records: severity tiers and the empirical
assignment procedure; the corpus-error-free invariant; the alias table as
display/validation-only with its XML witnesses; the cite-don't-vendor provenance policy and
the observed 403; the Java-logic / JSON-metadata split and the three-way id parity test.
ADR-0011 records: why positions live in `_layout_*.json` (parser byte-identity, hard rule 3),
the exclusion contract shared with `_history/`, and why a committed sidecar beats
localStorage here.

- [ ] **Step 4: Update the docs**

`CLAUDE.md`: Tab 2's description in the module list; a corpus caveat for the alias table
pointing at `docs/ipc/README.md`; a `docs/ipc/` line in the "More" section; the new endpoints
in the testing section's summary of gates.
`docs/architecture.md`: add `GET /api/ipc/rules`, `GET`/`PUT /api/layouts/{*path}`,
`GET /api/summary` to the endpoint table, and the extended `POST /api/recipes/validate`
response.
`frontend/AGENTS.md`: the new Tab 2 component ledger and the `api/ipcRules.ts` /
`api/layoutQueries.ts` entries.

- [ ] **Step 5: Acceptance walk**

Work spec §10's 14 criteria in order. For each, record PASS/FAIL with the command run and its
output, or the exact UI interaction and what was observed. Any criterion that cannot pass is
recorded as an implementation deviation in spec §13 with its reason — never silently dropped.
Criteria 1, 3, 5, 6, 7, 8, 9, 10, 11, 12 are manual UI checks against `make dev`; 2, 4, 13, 14
are command-verifiable.

- [ ] **Step 6: Commit**

```bash
git add scripts/recipe_sweep.mts CLAUDE.md docs/architecture.md frontend/AGENTS.md \
        docs/adr/0010-ipc-conformance-ruleset.md \
        docs/adr/0011-canvas-layout-sidecar.md \
        docs/superpowers/specs/2026-08-01-etl-modifier-redesign-design.md \
        docs/superpowers/plans/2026-08-01-etl-modifier-redesign.md
git commit -m "chore: ETL Modifier redesign acceptance walk — sweep, ADRs, docs

Task 18. recipe_sweep asserts every emitted ruleId exists in the catalogue and tallies
warnings. ADR-0010 (IPC conformance ruleset) and ADR-0011 (layout sidecar) recorded.
Spec §10's criteria verified with evidence; deviations recorded in spec §13."
```

---

## Critical Files for Implementation

| File | Why it matters |
|---|---|
| `parser/.../model/recipe/AbstractTarget.scala`, `AbstractSource.scala` | The authoritative recipe grammar. Every `IPC-TYP-*` rule and every Inspector widget traces to a line here. |
| `parser/.../recipe/RecipeConstants.scala:48-57` | Function and operator vocabulary for `IPC-EXP-*`. |
| `parser/.../recipe/transformation/AbstractTargetFactory.scala:51-88` | Explains `unionInput` and `joinerInput` naming — the evidence behind two alias entries. |
| `backend/.../service/RecipeService.java:177-220` | The validator being replaced; its Javadoc records why the old "known type" check was downgraded. |
| `backend/.../service/support/HistorySidecar.java` | The structural template `LayoutSidecar` copies, including the exclusion contract. |
| `frontend/src/api/recipeAdapter.ts:117-124` | `kindAndLabel`'s unknown-type fallthrough — the reason 145 corpus nodes render as generic boxes today. |
| `frontend/src/components/shared/EtlCanvas.tsx` | `IpcCanvas`'s structural template. **Read it; do not edit it.** |
| `frontend/src/components/tab2/ETLModifier.test.tsx` | The MSW + RTL idiom every Tab 2 test follows. |
| `docs/superpowers/specs/2026-08-01-etl-modifier-redesign-design.md` | The spec. Section references throughout this plan point here. |
