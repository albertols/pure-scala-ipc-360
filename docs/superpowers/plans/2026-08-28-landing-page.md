# ETL 360 Landing Page — Implementation Plan (sub-project 11)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A landing page that answers "is this pointed at my data, and is it working?" on arrival — with the project's mascot as the readiness indicator rather than decoration beside one — and introduces the four tabs, the corpus scale, the progress, and the architecture before the user enters the app.

**Architecture:** One new backend endpoint (`GET /api/readiness`) aggregates values other services already cache, plus the one genuinely new number: a DAG count derived from distinct `workflow` values on the mtime-cached L2L entries. The frontend adds a `view: 'landing' | 'tabs'` state to `App.tsx` (no router) and five focused components reading that single payload. The mascot is the user's own image as a hero backdrop, with mood carried by animated SVG overlays and a CSS colour grade over it.

**Tech Stack:** Java 17 / Spring Boot 3.3, JUnit 5 + MockMvc + AssertJ; React 19 / TypeScript / Vite, Vitest + React Testing Library + MSW; `sips` for the one image conversion.

**Spec:** `docs/superpowers/specs/2026-08-28-landing-page-design.md` — section references below (`spec §5`) point there.

## Global Constraints

- **No new frontend runtime dependency.** `frontend/package.json` `dependencies` stays exactly `@tanstack/react-query`, `react`, `react-dom`. No router, no animation library, no diagram library, no mermaid at runtime or build time.
- **No parser changes.** No file under `parser/src/main/scala` or `parser/src/main/resources/xmltobq` is modified.
- **Figma visual contract (ADR-0005):** existing tokens only — `--bg`, `--surface`, `--surface-2`, `--surface-3`, `--border`, `--border-subtle`, `--text`, `--text-muted`, `--text-dim`, `--blue`, `--green`, `--teal`, `--purple`, `--yellow`, `--orange`, `--pink`, `--red`, `--cyan`. **No new design token.** Spec §9's four sanctioned departures are the whole permitted new visual surface.
- **New `@keyframes` follow the `spinner-rotate` precedent** (`index.css:77`): an animation utility, not a design token. Every animation added must also have a `prefers-reduced-motion: reduce` rule, next to the existing one at `index.css:84`.
- **`/api/readiness` must not change any existing endpoint's response.** `CorpusContractTest`, `LayerToLayerContractTest`, `ClusterEndpointsContractTest` and `scripts/relationships_sweep.mts` must pass untouched.
- **`ClusterIndexService.index()` is called at most ONCE per readiness request.** `index()` invokes `B15Reader.fingerprint()`, a stat sweep of every dated export directory; a per-call invocation is a mistake sub-project 10 already made and fixed (ADR-0014).
- **`types.gen.ts` is generated**, never hand-edited. Refresh with `make generate-api` against a running backend.
- **Report backend test counts by counting `<testcase>` elements**, never by summing the `.txt` reports: `grep -ho "<testcase " backend/target/surefire-reports/*.xml | wc -l`. Surefire does not roll `@Nested` results into the parent summary, and the `.txt` sum undercounts — this misled every agent in the previous sub-project.
- **Data-handling (spec §14):** this page renders resolved filesystem paths and a GCP project id. No path, project id, hostname, job id or cluster name from any real environment may appear in a test, fixture, doc, ADR, screenshot or commit message. Screenshots come from the committed mock tiers only.
- **Staging discipline:** stage explicit paths. **NEVER `git add -A`** — `.claude/settings.json` and several `_layout_*.json` are user-local untracked files. (`first_prompt.md` is now gitignored.)
- **Ledger:** tick this plan's checkboxes and stage the plan file in the same commit as the task's changes.

## Environment

```bash
export PATH="/usr/local/bin:$HOME/.local/toolchains/node-v22.23.2-darwin-x64/bin:$PATH"
export JAVA_HOME="/Applications/IntelliJ IDEA CE.app/Contents/jbr/Contents/Home"
```

**Never combine `-am` with `-Dtest`** — `-am` builds `parser` too, surefire applies the same filter there, and the reactor fails with "No tests matching pattern". Use `mvn -q -am -pl backend install -DskipTests` once, then `mvn -q -pl backend test -Dtest=ClassName`.

## Baselines at plan authorship (2026-08-28, verified on `main` @ `bcbf33d`)

Backend **267** tests across **43** test files, 0 failures. Frontend **591** tests across **45** files, 0 failures. `tsc --noEmit` clean, `pnpm build` clean (448 KB / 124 KB gzipped), `make validate-loop` PASS.

Committed-mock values this plan asserts against: corpus **81** XMLs · **86** recipes · **212** DDLs · **119** dirs; operational **21** clusters · **30** recipes · **14** days · **417** rows; **23** distinct workflows; **601** plan checkboxes (**596** done); **16** ADRs.

## File Structure

**Backend — new:**

| File | Responsibility |
|---|---|
| `service/ProgressScanner.java` | Globs `docs/superpowers/plans/*.md` and `docs/adr/0*.md`, counts checkboxes and ADRs. Returns `null` when `docs/` is unreachable. Nothing else. |
| `service/ReadinessService.java` | Composes corpus, operational, DAG, roots and progress into one value. Owns the once-per-request `index()` discipline. |
| `api/ReadinessController.java` | `GET /api/readiness`. DTO assembly only. |
| `api/dto/ReadinessDto.java` | The wire shape. |

**Frontend — new:**

| File | Responsibility |
|---|---|
| `src/tabs.ts` | `TABS` and `FUTURE_TABS`, lifted out of `App.tsx` so the tab strip and the landing page cannot drift. No JSX beyond the existing icon elements. |
| `src/api/readinessQueries.ts` | `useReadiness()`. |
| `src/assets/mascot-hero.jpg` | The user's image at 600px, JPEG q80 (~151 KB). |
| `src/components/landing/Landing.tsx` | Composition + entry affordances. Owns no data fetching beyond `useReadiness()`. |
| `src/components/landing/MascotScene.tsx` | Hero backdrop, mood overlays, colour grade, reduced-motion handling. |
| `src/components/landing/StatsGrid.tsx` | The counts. |
| `src/components/landing/TabPreview.tsx` | Per-tab cards + future stubs. |
| `src/components/landing/ProgressStrip.tsx` | Tasks/ADRs, renders nothing when `progress` is null. |
| `src/components/landing/EnvironmentPanel.tsx` | Resolved roots, tiers, GCP project/region. |
| `src/components/landing/ArchitectureDiagram.tsx` | Inline SVG with clickable regions. |

**Modified:** `frontend/src/App.tsx` (view switch, imports `TABS` from `src/tabs.ts`), `frontend/src/index.css` (new keyframes + reduced-motion rules), `scripts/validate_loop.sh`, `README.md`, `docs/architecture.md`, `CLAUDE.md`. **New docs:** `docs/adr/0016-landing-readiness-aggregate.md`, `docs/img/etl360-architecture.svg`.

---

# Part 1 — Backend

### Task 1: `ProgressScanner` — repo-sourced progress, nullable by design

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/service/ProgressScanner.java`
- Create: `backend/src/test/java/io/pure360/etl360/service/ProgressScannerTest.java`

**Interfaces:**
- Consumes: `RepoRoot.resolve(Path)` (static; **throws `IllegalStateException`** when no `pom.xml`+`parser/` ancestor exists).
- Produces, for Task 2:
  - `record Progress(int tasksDone, int tasksTotal, int adrs)`
  - `Progress scan()` — returns **`null`** when progress cannot be determined.

**Why:** the user asked for "feature progress, backlog … according to the github repository". `gh` is not installed and the GitHub API is unreachable from this machine, so the honest source is the repo itself — and it is the better one: `CLAUDE.md` states the plan checkboxes *are* this project's progress ledger.

**The nullable contract is the load-bearing part.** There are **two** ways this can fail, not one: `docs/` may be absent (a packaged deployment need not ship documentation), **and** `RepoRoot.resolve` throws when it cannot find a `pom.xml`+`parser/` ancestor. Both must yield `null`, not an exception. A landing page that 500s because documentation is missing would be absurd.

- [x] **Step 1: Write the failing test**

```java
package io.pure360.etl360.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class ProgressScannerTest {

    private static Path repoWithDocs(Path root, String plans, int adrCount) throws Exception {
        // RepoRoot.resolve looks for pom.xml + parser/ — give it both.
        Files.createFile(root.resolve("pom.xml"));
        Files.createDirectories(root.resolve("parser"));
        Path plansDir = Files.createDirectories(root.resolve("docs/superpowers/plans"));
        Files.writeString(plansDir.resolve("a-plan.md"), plans);
        Path adrDir = Files.createDirectories(root.resolve("docs/adr"));
        for (int i = 1; i <= adrCount; i++) {
            Files.writeString(adrDir.resolve(String.format("%04d-decision.md", i)), "# adr\n");
        }
        return root;
    }

    @Test
    void countsTickedAndUntickedCheckboxesAcrossPlans(@TempDir Path tmp) throws Exception {
        repoWithDocs(tmp, "- [x] done one\n- [x] done two\n- [ ] open one\ntext\n", 3);

        ProgressScanner.Progress p = new ProgressScanner(tmp).scan();

        assertThat(p.tasksDone()).isEqualTo(2);
        assertThat(p.tasksTotal()).isEqualTo(3);
        assertThat(p.adrs()).isEqualTo(3);
    }

    /** A line mentioning "- [x]" mid-sentence is prose, not a checkbox. Only line starts count. */
    @Test
    void onlyCountsCheckboxesAtTheStartOfALine(@TempDir Path tmp) throws Exception {
        repoWithDocs(tmp, "- [x] real\nsee - [ ] in the text above\n  - [x] indented is still a checkbox\n", 1);

        ProgressScanner.Progress p = new ProgressScanner(tmp).scan();

        assertThat(p.tasksTotal()).isEqualTo(2);
        assertThat(p.tasksDone()).isEqualTo(2);
    }

    @Test
    void countsOnlyNumberedAdrsNotTheTemplateOrReadme(@TempDir Path tmp) throws Exception {
        Path root = repoWithDocs(tmp, "- [x] one\n", 2);
        Files.writeString(root.resolve("docs/adr/README.md"), "# index\n");
        Files.writeString(root.resolve("docs/adr/template.md"), "# template\n");

        assertThat(new ProgressScanner(root).scan().adrs()).isEqualTo(2);
    }

    /** A packaged deployment need not ship docs/. That must degrade, not throw. */
    @Test
    void returnsNullWhenDocsIsAbsent(@TempDir Path tmp) throws Exception {
        Files.createFile(tmp.resolve("pom.xml"));
        Files.createDirectories(tmp.resolve("parser"));

        assertThat(new ProgressScanner(tmp).scan()).isNull();
    }

    /** RepoRoot.resolve THROWS when there is no pom.xml+parser/ ancestor — the second failure mode. */
    @Test
    void returnsNullWhenTheRepoRootCannotBeResolved(@TempDir Path tmp) {
        assertThat(new ProgressScanner(tmp).scan()).isNull();
    }

    @Test
    void rescansWhenAPlanFileChanges(@TempDir Path tmp) throws Exception {
        Path root = repoWithDocs(tmp, "- [x] one\n- [ ] two\n", 1);
        ProgressScanner scanner = new ProgressScanner(root);

        ProgressScanner.Progress first = scanner.scan();
        assertThat(scanner.scan()).isSameAs(first);          // unchanged docs -> cache hit

        Path plan = root.resolve("docs/superpowers/plans/a-plan.md");
        Files.writeString(plan, "- [x] one\n- [x] two\n");
        Files.setLastModifiedTime(plan, java.nio.file.attribute.FileTime.fromMillis(
            Files.getLastModifiedTime(plan).toMillis() + 2000));

        ProgressScanner.Progress second = scanner.scan();
        assertThat(second).isNotSameAs(first);
        assertThat(second.tasksDone()).isEqualTo(2);
    }
}
```

- [x] **Step 2: Run it to verify it fails**

```bash
mvn -q -pl backend test -Dtest=ProgressScannerTest
```

Expected: FAIL — `cannot find symbol: class ProgressScanner`.

- [x] **Step 3: Write the implementation**

```java
package io.pure360.etl360.service;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Counts this repository's own progress ledger: ticked and unticked checkboxes across
 * {@code docs/superpowers/plans/*.md}, and the numbered ADRs under {@code docs/adr/}.
 *
 * <p>This is the honest source for "feature progress" — {@code gh} is not installed on the target
 * machine and the GitHub API is unreachable from the app, and per {@code CLAUDE.md} the plan
 * checkboxes ARE this project's progress record.
 *
 * <p><b>{@link #scan()} returns null rather than throwing when progress cannot be determined.</b>
 * Two things can go wrong and both are legitimate: a packaged deployment need not ship {@code docs/},
 * and {@link io.pure360.etl360.config.RepoRoot#resolve} throws when it cannot find a
 * {@code pom.xml}+{@code parser/} ancestor. A landing page that fails because documentation is
 * missing would be absurd — the page renders every other section and omits progress.
 */
@Component
public class ProgressScanner {
    /** Leading whitespace then "- [x]" / "- [ ]". Mid-sentence mentions are prose, not checkboxes. */
    private static final Pattern DONE = Pattern.compile("^\\s*- \\[x\\]", Pattern.MULTILINE);
    private static final Pattern ANY  = Pattern.compile("^\\s*- \\[[ x]\\]", Pattern.MULTILINE);
    private static final Pattern ADR  = Pattern.compile("\\d{4}-.*\\.md");

    public record Progress(int tasksDone, int tasksTotal, int adrs) {}

    private final Path startDir;
    private volatile String fingerprint;
    private volatile Progress cached;

    public ProgressScanner() {
        this(Path.of(System.getProperty("user.dir")));
    }

    ProgressScanner(Path startDir) {
        this.startDir = startDir;
    }

    /** @return counts, or null when {@code docs/} is unreachable — see the class javadoc. */
    public Progress scan() {
        Path docs = docsDir();
        if (docs == null) return null;
        String fp = fingerprint(docs);
        Progress hit = cached;
        if (hit != null && fp.equals(fingerprint)) return hit;
        synchronized (this) {
            if (cached != null && fp.equals(fingerprint)) return cached;
            Progress built = build(docs);
            cached = built;
            fingerprint = fp;
            return built;
        }
    }

    /** Null when the repo root cannot be resolved OR docs/ is not there. Never throws. */
    private Path docsDir() {
        try {
            Path docs = io.pure360.etl360.config.RepoRoot.resolve(startDir).resolve("docs");
            return Files.isDirectory(docs) ? docs : null;
        } catch (IllegalStateException e) {
            return null;
        }
    }

    private Progress build(Path docs) {
        int done = 0, total = 0;
        for (Path plan : listMarkdown(docs.resolve("superpowers/plans"))) {
            String text = read(plan);
            done += DONE.matcher(text).results().toList().size();
            total += ANY.matcher(text).results().toList().size();
        }
        int adrs = 0;
        for (Path adr : listMarkdown(docs.resolve("adr"))) {
            if (ADR.matcher(adr.getFileName().toString()).matches()) adrs++;
        }
        return new Progress(done, total, adrs);
    }

    private String fingerprint(Path docs) {
        StringBuilder sb = new StringBuilder();
        for (Path dir : List.of(docs.resolve("superpowers/plans"), docs.resolve("adr"))) {
            for (Path f : listMarkdown(dir)) {
                try {
                    BasicFileAttributes a = Files.readAttributes(f, BasicFileAttributes.class);
                    sb.append(f).append('|').append(a.lastModifiedTime().toMillis())
                      .append('|').append(a.size()).append('\n');
                } catch (IOException e) {
                    // Raced away between listing and stat — skip it rather than fail the page.
                }
            }
        }
        return sb.toString();
    }

    private List<Path> listMarkdown(Path dir) {
        if (!Files.isDirectory(dir)) return List.of();
        List<Path> out = new ArrayList<>();
        try (DirectoryStream<Path> s = Files.newDirectoryStream(dir, "*.md")) {
            for (Path p : s) out.add(p);
        } catch (IOException e) {
            return List.of();
        }
        out.sort(Path::compareTo);
        return out;
    }

    private String read(Path p) {
        try {
            return Files.readString(p);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
```

- [x] **Step 4: Run the test to verify it passes**

```bash
mvn -q -pl backend test -Dtest=ProgressScannerTest
```

Expected: PASS, 6 tests.

- [x] **Step 5: Sanity-check it against the real repo**

```bash
cd /Users/serna/IdeaProjects/pure-scala-ipc-360
echo "expect done=$(cat docs/superpowers/plans/*.md | grep -c '^- \[x\]') total=$(cat docs/superpowers/plans/*.md | grep -c '^- \[') adrs=$(ls docs/adr/0*.md | wc -l | tr -d ' ')"
```

The scanner's numbers must match this shell count. If they differ, the regex is wrong — fix the regex, not the expectation. (At authorship: done=596, total=601, adrs=16.)

- [x] **Step 6: Commit**

```bash
git add backend/src/main/java/io/pure360/etl360/service/ProgressScanner.java \
        backend/src/test/java/io/pure360/etl360/service/ProgressScannerTest.java \
        docs/superpowers/plans/2026-08-28-landing-page.md
git commit -m "feat(readiness): count the repo's own progress ledger

Plans' checkboxes and numbered ADRs, fingerprint-cached like B15Reader and
DomService. gh is not installed and the GitHub API is unreachable, and per
CLAUDE.md the plan checkboxes ARE this project's progress record.

scan() returns null rather than throwing for BOTH failure modes: docs/ absent
(a packaged deployment need not ship it) and RepoRoot.resolve throwing when
there is no pom.xml+parser/ ancestor."
```

---

### Task 2: `ReadinessService` + `ReadinessDto`

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/api/dto/ReadinessDto.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/ReadinessService.java`
- Create: `backend/src/test/java/io/pure360/etl360/service/ReadinessServiceTest.java`

**Interfaces:**
- Consumes: `CorpusService.summary()` → `SummaryDto(xmlCount, recipeCount, ddlCount, dirCount, layers)`; `ClusterIndexService.index()` → `Index` with `totals()` → `Totals(clusters, recipes, dates, rows)`; `DiagnosticsService.report()` → `DiagnosticsDto` (has `status()`); `LayerToLayerService.entries()` → `List<LayerToLayerEntryDto>` (each has `workflow()`); `ProgressScanner.scan()` → `Progress | null`; `DataRoots.composerMode()`.
- Produces, for Task 3: `ReadinessDto readiness()`.

**Why:** the landing page needs corpus counts, operational totals, a DAG count, resolved roots and progress. Four coordinated client fetches on a "make it shine" first screen is the wrong first impression, and the DAG count is not served anywhere.

**The DAG count is the only new number, and where it comes from matters.** Tab 4 derives its clusters from `workflow` on the *full relationships graph*. Computing the count that way would pull the payload sub-project 10 existed to bound. Count distinct non-blank `workflow` values from `LayerToLayerService.entries()` instead — mtime-cached, no node or edge construction. **23** on the committed mock.

**Call `index()` exactly once.** It invokes `B15Reader.fingerprint()`, a stat sweep of every dated export directory. ADR-0014 records that a per-call invocation was already shipped and fixed once.

- [x] **Step 1: Write the failing test**

```java
package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.ReadinessDto;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

/** Against the committed mock tier — the same floors the other contract tests assert. */
@SpringBootTest
class ReadinessServiceTest {
    @Autowired ReadinessService readiness;

    @Test
    void reportsTheCommittedCorpusCounts() {
        ReadinessDto r = readiness.readiness();

        assertThat(r.corpus().xml()).isEqualTo(81);
        assertThat(r.corpus().recipes()).isEqualTo(86);
        assertThat(r.corpus().ddl()).isEqualTo(212);
        assertThat(r.corpus().layers()).contains("CDM", "DWH");
    }

    @Test
    void reportsTheCommittedOperationalTotals() {
        ReadinessDto r = readiness.readiness();

        assertThat(r.operational().clusters()).isEqualTo(21);
        assertThat(r.operational().recipes()).isEqualTo(30);
        assertThat(r.operational().days()).isEqualTo(14);
        assertThat(r.operational().rows()).isEqualTo(417);
    }

    /** The one genuinely new number, and it must NOT come from the relationships graph. */
    @Test
    void countsDistinctWorkflowsFromTheControlSchema() {
        assertThat(readiness.readiness().dags().workflows()).isEqualTo(23);
    }

    @Test
    void mirrorsTheDiagnosticsStatusRatherThanComputingASecondOpinion() {
        ReadinessDto r = readiness.readiness();

        assertThat(r.status()).isIn("ok", "degraded");
        assertThat(r.roots()).isNotEmpty();
        assertThat(r.roots().get(0).resolved()).isNotBlank();
    }

    /** docs/ is present in this repo, so progress resolves — see ProgressScannerTest for null. */
    @Test
    void carriesRepoSourcedProgress() {
        ReadinessDto.Progress p = readiness.readiness().progress();

        assertThat(p).isNotNull();
        assertThat(p.tasksTotal()).isGreaterThan(0);
        assertThat(p.tasksDone()).isLessThanOrEqualTo(p.tasksTotal());
        assertThat(p.adrs()).isGreaterThanOrEqualTo(16);
    }
}
```

- [x] **Step 2: Run it to verify it fails**

```bash
mvn -q -pl backend test -Dtest=ReadinessServiceTest
```

Expected: FAIL — `cannot find symbol: class ReadinessService`.

- [x] **Step 3: Write the DTO**

```java
package io.pure360.etl360.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/**
 * {@code GET /api/readiness}: everything the landing page needs, in one request. Aggregates values
 * other services already cache — it parses no corpus, control schema or b15 data of its own.
 *
 * <p>{@code progress} is nullable by design: a packaged deployment need not ship {@code docs/}.
 * {@code status} mirrors {@link DiagnosticsDto#status()} rather than forming a second opinion about
 * health, so the landing page and Tab 3's data-root report can never disagree.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ReadinessDto(String status, Corpus corpus, Operational operational, Dags dags,
                           List<Root> roots, Progress progress) {

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Corpus(int xml, int recipes, int ddl, int dirs, List<String> layers) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Operational(int clusters, int recipes, int days, int rows, String mode) {}

    /** Distinct non-blank {@code workflow} values in the control schema — NOT graph-derived. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Dags(int workflows) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Root(String name, String resolved, String tier, String status, String hint) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Progress(int tasksDone, int tasksTotal, int adrs) {}
}
```

- [x] **Step 4: Write the service**

```java
package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.DiagnosticsDto;
import io.pure360.etl360.api.dto.LayerToLayerEntryDto;
import io.pure360.etl360.api.dto.ReadinessDto;
import io.pure360.etl360.api.dto.SummaryDto;
import io.pure360.etl360.config.DataRoots;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Assembles the landing page's single payload from services that already cache their work.
 *
 * <p>Two disciplines this class exists to hold:
 * <ol>
 *   <li>{@link ClusterIndexService#index()} is called <b>once</b> — it invokes
 *       {@code B15Reader.fingerprint()}, a stat sweep per dated export directory (ADR-0014).</li>
 *   <li>The DAG count comes from {@link LayerToLayerService#entries()}, not from the relationships
 *       graph. Tab 4 groups by {@code workflow} over the whole graph; counting that way here would
 *       pull the exact payload sub-project 10 exists to bound.</li>
 * </ol>
 */
@Service
public class ReadinessService {
    private final CorpusService corpus;
    private final ClusterIndexService clusterIndex;
    private final DiagnosticsService diagnostics;
    private final LayerToLayerService layerToLayer;
    private final ProgressScanner progressScanner;
    private final DataRoots roots;

    public ReadinessService(CorpusService corpus, ClusterIndexService clusterIndex,
                            DiagnosticsService diagnostics, LayerToLayerService layerToLayer,
                            ProgressScanner progressScanner, DataRoots roots) {
        this.corpus = corpus;
        this.clusterIndex = clusterIndex;
        this.diagnostics = diagnostics;
        this.layerToLayer = layerToLayer;
        this.progressScanner = progressScanner;
        this.roots = roots;
    }

    public ReadinessDto readiness() {
        SummaryDto s = corpus.summary();
        ClusterIndexService.Totals t = clusterIndex.index().totals();   // ONCE — see class javadoc
        DiagnosticsDto d = diagnostics.report();

        Set<String> workflows = new LinkedHashSet<>();
        for (LayerToLayerEntryDto e : layerToLayer.entries()) {
            String wf = e.workflow();
            if (wf != null && !wf.isBlank()) workflows.add(wf.trim());
        }

        List<ReadinessDto.Root> rootList = new ArrayList<>();
        rootList.add(new ReadinessDto.Root("corpus", d.corpus().resolved(), "real",
            d.corpus().status(), d.corpus().hint()));
        rootList.add(new ReadinessDto.Root("dwhControl", d.dwhControl().resolvedReal(),
            d.dwhControl().tier(), d.dwhControl().status(), d.dwhControl().hint()));
        rootList.add(new ReadinessDto.Root("composer", d.composer().resolved(),
            d.composer().tier(), d.composer().status(), d.composer().hint()));

        ProgressScanner.Progress p = progressScanner.scan();
        ReadinessDto.Progress progress = p == null ? null
            : new ReadinessDto.Progress(p.tasksDone(), p.tasksTotal(), p.adrs());

        return new ReadinessDto(
            d.status(),
            new ReadinessDto.Corpus(s.xmlCount(), s.recipeCount(), s.ddlCount(), s.dirCount(), s.layers()),
            new ReadinessDto.Operational(t.clusters(), t.recipes(), t.dates(), t.rows(), roots.composerMode()),
            new ReadinessDto.Dags(workflows.size()),
            List.copyOf(rootList),
            progress);
    }
}
```

**Adapt the `Root` construction to `DiagnosticsDto`'s actual accessors** — read
`backend/src/main/java/io/pure360/etl360/api/dto/DiagnosticsDto.java` first and use its real field
names. The three nested records are `RootStatus`, `ControlSchema` and (for composer) whichever record
that field uses; they do **not** share one shape. If an accessor named above does not exist, use the
real one rather than inventing a getter.

- [x] **Step 5: Run the test to verify it passes**

```bash
mvn -q -pl backend test -Dtest=ReadinessServiceTest
```

Expected: PASS, 5 tests.

- [x] **Step 6: Prove `index()` is called once, not per field**

Add to `ReadinessServiceTest`:

```java
    /** index() calls B15Reader.fingerprint(), a stat sweep per dated export (ADR-0014). */
    @Test
    void readsTheClusterIndexExactlyOncePerRequest() {
        class Counting extends ClusterIndexService {
            int calls = 0;
            Counting(B15Reader b15) { super(b15); }
            @Override public Index index() { calls++; return super.index(); }
        }
        Counting counting = new Counting(new B15Reader(rootsForTest()));
        ReadinessService svc = new ReadinessService(corpusForTest(), counting, diagnosticsForTest(),
            layerToLayerForTest(), new ProgressScanner(), rootsForTest());

        svc.readiness();

        assertThat(counting.calls).isEqualTo(1);
    }
```

Wire the `*ForTest()` helpers from the autowired beans (add `@Autowired` fields for `CorpusService`,
`DiagnosticsService`, `LayerToLayerService`, `B15Reader` and `DataRoots` and return them). If
`ClusterIndexService.index()` is `final` or the class cannot be subclassed, make the minimal change
that allows the override rather than dropping the test — this discipline was violated once already.

- [x] **Step 7: Commit**

```bash
git add backend/src/main/java/io/pure360/etl360/api/dto/ReadinessDto.java \
        backend/src/main/java/io/pure360/etl360/service/ReadinessService.java \
        backend/src/test/java/io/pure360/etl360/service/ReadinessServiceTest.java \
        docs/superpowers/plans/2026-08-28-landing-page.md
git commit -m "feat(readiness): one aggregate for the landing page

Corpus counts, b15 totals, resolved roots and progress, composed from services
that already cache their work. The only new number is the DAG count: distinct
non-blank workflow values from the mtime-cached L2L entries (23 on the mock),
NOT from the relationships graph — deriving it that way would pull the payload
sub-project 10 exists to bound.

status mirrors DiagnosticsService rather than forming a second opinion, so the
landing page and Tab 3's data-root report cannot disagree. index() is called
once per request and a test pins it (ADR-0014)."
```

---

### Task 3: `GET /api/readiness`

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/api/ReadinessController.java`
- Create: `backend/src/test/java/io/pure360/etl360/ReadinessContractTest.java`

**Interfaces:**
- Consumes: `ReadinessService.readiness()`.
- Produces, for Task 4: the wire shape the frontend's `useReadiness()` types against.

**Route note:** `/api/readiness` is a fresh top-level path under `@RequestMapping("/api")` — no
template collides with it (unlike `/api/operational/{date}`, which forced explicit precedence
checks in the previous sub-project). Copy `SummaryController`'s shape: constructor injection, one
`@GetMapping`, no logic.

- [ ] **Step 1: Write the failing test**

```java
package io.pure360.etl360;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.oneOf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Contract for the landing page's single payload, against the committed mock tier. */
@SpringBootTest
@AutoConfigureMockMvc
class ReadinessContractTest {
    @Autowired MockMvc mvc;

    @Test
    void servesEveryFieldTheLandingPageNeedsInOneRequest() throws Exception {
        mvc.perform(get("/api/readiness"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.status").value(oneOf("ok", "degraded")))
           .andExpect(jsonPath("$.corpus.xml").value(81))
           .andExpect(jsonPath("$.corpus.recipes").value(86))
           .andExpect(jsonPath("$.corpus.ddl").value(212))
           .andExpect(jsonPath("$.operational.clusters").value(21))
           .andExpect(jsonPath("$.operational.recipes").value(30))
           .andExpect(jsonPath("$.operational.days").value(14))
           .andExpect(jsonPath("$.operational.rows").value(417))
           .andExpect(jsonPath("$.dags.workflows").value(23))
           .andExpect(jsonPath("$.roots", hasSize(3)))
           .andExpect(jsonPath("$.roots[0].resolved").value(notNullValue()))
           .andExpect(jsonPath("$.progress.adrs").value(greaterThanOrEqualTo(16)));
    }

    /** One request, not four — that is the endpoint's whole reason to exist. */
    @Test
    void carriesCorpusOperationalDagsAndRootsTogether() throws Exception {
        mvc.perform(get("/api/readiness"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.corpus").value(notNullValue()))
           .andExpect(jsonPath("$.operational").value(notNullValue()))
           .andExpect(jsonPath("$.dags").value(notNullValue()))
           .andExpect(jsonPath("$.roots").value(notNullValue()));
    }

    /** Existing endpoints must be untouched by this addition. */
    @Test
    void doesNotDisturbTheEndpointsTheLandingPageAggregates() throws Exception {
        mvc.perform(get("/api/summary")).andExpect(status().isOk())
           .andExpect(jsonPath("$.xmlCount").value(81));
        mvc.perform(get("/api/operational/clusters")).andExpect(status().isOk())
           .andExpect(jsonPath("$.totals.clusters").value(21));
        mvc.perform(get("/api/diagnostics")).andExpect(status().isOk())
           .andExpect(jsonPath("$.status").value(notNullValue()));
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
mvn -q -pl backend test -Dtest=ReadinessContractTest
```

Expected: FAIL — 404 on `/api/readiness`.

- [ ] **Step 3: Write the controller**

```java
package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.ReadinessDto;
import io.pure360.etl360.service.ReadinessService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Serves the landing page's single aggregate. Holds no logic — see {@link ReadinessService}. */
@RestController
@RequestMapping("/api")
public class ReadinessController {
    private final ReadinessService readiness;

    public ReadinessController(ReadinessService readiness) {
        this.readiness = readiness;
    }

    @GetMapping("/readiness")
    public ReadinessDto readiness() {
        return readiness.readiness();
    }
}
```

- [ ] **Step 4: Run the test, then the full backend suite**

```bash
mvn -q -pl backend test -Dtest=ReadinessContractTest
mvn -q -am -pl backend clean test
grep -ho "<testcase " backend/target/surefire-reports/*.xml | wc -l
grep -l "<failure\|<error" backend/target/surefire-reports/*.xml || echo "no failures"
```

Expected: contract test PASS (3 tests); full suite **281** (267 baseline + 6 `ProgressScannerTest` + 5 `ReadinessServiceTest` + 3 here), 0 failures. **Count `<testcase>` elements, not the `.txt` sum** — see Global Constraints. Report the real number.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/io/pure360/etl360/api/ReadinessController.java \
        backend/src/test/java/io/pure360/etl360/ReadinessContractTest.java \
        docs/superpowers/plans/2026-08-28-landing-page.md
git commit -m "feat(api): GET /api/readiness

One request instead of four coordinated client fetches on the app's first
screen. Asserts the committed-mock floors (81/86/212 corpus, 21/30/14/417
operational, 23 workflows) and that the four endpoints it aggregates are
themselves undisturbed."
```

---

# Part 2 — Frontend foundation

### Task 4: `useReadiness()` and the generated types

**Files:**
- Create: `frontend/src/api/readinessQueries.ts`
- Create: `frontend/src/api/readinessQueries.test.ts`
- Modify: `frontend/src/api/types.gen.ts` (regenerated, never hand-edited)

**Interfaces:**
- Consumes: `apiGet` from `api/client.ts`; `components['schemas']['ReadinessDto']`.
- Produces, for Tasks 6-10: `type ReadinessT`, `useReadiness(): UseQueryResult<ReadinessT>`.

**Why:** every landing component reads this one payload. One hook, one loading state, one error state.

- [ ] **Step 1: Regenerate the API types against a running backend**

```bash
mvn -q -am -pl backend install -DskipTests && (cd backend && mvn -q spring-boot:run &) && sleep 25
make generate-api
lsof -ti tcp:8080 | xargs kill -9 2>/dev/null || true
grep -c "ReadinessDto" frontend/src/api/types.gen.ts
```

Expected: `ReadinessDto` present (non-zero). If it is absent the backend was not running or not rebuilt — fix that and regenerate. **Do not hand-edit `types.gen.ts`.**

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { useReadiness } from './readinessQueries'

const READY = {
  status: 'ok',
  corpus: { xml: 81, recipes: 86, ddl: 212, dirs: 119, layers: ['CDM', 'DWH'] },
  operational: { clusters: 21, recipes: 30, days: 14, rows: 417, mode: 'mock' },
  dags: { workflows: 23 },
  roots: [{ name: 'corpus', resolved: '/mock/xmltobq', tier: 'real', status: 'ok' }],
  progress: { tasksDone: 596, tasksTotal: 601, adrs: 16 },
}

const server = setupServer(
  http.get('*/api/readiness', () => HttpResponse.json(READY)),
)
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('useReadiness', () => {
  it('loads the aggregate in one request', async () => {
    const { result } = renderHook(() => useReadiness(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(result.current.data!.corpus!.xml).toBe(81)
    expect(result.current.data!.dags!.workflows).toBe(23)
    expect(result.current.data!.progress!.tasksDone).toBe(596)
  })

  it('surfaces an error rather than resolving to empty data', async () => {
    server.use(http.get('*/api/readiness', () => new HttpResponse(null, { status: 500 })))

    const { result } = renderHook(() => useReadiness(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })

  it('tolerates a payload with no progress (a deployment without docs/)', async () => {
    server.use(http.get('*/api/readiness', () => HttpResponse.json({ ...READY, progress: undefined })))

    const { result } = renderHook(() => useReadiness(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data!.progress).toBeUndefined()
    expect(result.current.data!.corpus!.xml).toBe(81)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

```bash
cd frontend && pnpm test readinessQueries
```

Expected: FAIL — `Failed to resolve import "./readinessQueries"`.

- [ ] **Step 4: Write the hook**

```ts
import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client'
import type { components } from './types.gen'

export type ReadinessT = components['schemas']['ReadinessDto']

/**
 * The landing page's single payload. One request rather than four coordinated fetches — four
 * loading states on the app's first screen is the wrong first impression.
 *
 * `staleTime: Infinity` because readiness is a snapshot of how the app was configured at boot;
 * re-polling it while the user reads the page buys nothing and would refetch on window focus.
 */
export const useReadiness = () =>
  useQuery({
    queryKey: ['readiness'],
    queryFn: () => apiGet<ReadinessT>('/readiness'),
    staleTime: Infinity,
  })
```

- [ ] **Step 5: Run the tests and the type check**

```bash
cd frontend && pnpm test readinessQueries && pnpm exec tsc --noEmit
```

Expected: PASS, 3 tests; `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/readinessQueries.ts frontend/src/api/readinessQueries.test.ts \
        frontend/src/api/types.gen.ts docs/superpowers/plans/2026-08-28-landing-page.md
git commit -m "feat(api): useReadiness — the landing page's single payload

staleTime Infinity: readiness describes how the app was configured at boot, so
re-polling while the user reads the page buys nothing. Covers the null-progress
payload a deployment without docs/ produces."
```

---

### Task 5: Lift `TABS` and `FUTURE_TABS` out of `App.tsx`

**Files:**
- Create: `frontend/src/tabs.ts`
- Create: `frontend/src/tabs.test.ts`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `TabId` from `types.ts`.
- Produces, for Tasks 8-10: `TABS: TabMeta[]` where `TabMeta = { id: TabId; label: string; icon: React.ReactElement; accent: string; description: string }`, and `FUTURE_TABS: { label: string; desc: string }[]`.

**Why:** the landing page shows one card per tab, with the same label, accent and description the tab strip uses. Duplicating those arrays guarantees they drift the first time a description is edited. This is a pure move — **no content changes** — so the tab strip renders identically afterwards.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { TABS, FUTURE_TABS } from './tabs'
import type { TabId } from './types'

describe('tabs metadata', () => {
  it('describes all four live tabs, in strip order', () => {
    expect(TABS.map(t => t.id)).toEqual<TabId[]>(['viewer', 'modifier', 'operational', 'dag'])
  })

  it('gives every tab a label, an accent and a description the landing page can render', () => {
    for (const t of TABS) {
      expect(t.label).toBeTruthy()
      expect(t.accent).toMatch(/^#[0-9a-f]{6}$/i)
      expect(t.description.length).toBeGreaterThan(20)
      expect(t.icon).toBeTruthy()
    }
  })

  it('declares the two not-yet-built tabs', () => {
    expect(FUTURE_TABS.map(t => t.label)).toEqual(['ETL Tuner', 'ETL Agents'])
    for (const t of FUTURE_TABS) expect(t.desc).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd frontend && pnpm test tabs
```

Expected: FAIL — `Failed to resolve import "./tabs"`.

- [ ] **Step 3: Move the arrays verbatim**

Create `frontend/src/tabs.ts` containing the `TABS` and `FUTURE_TABS` declarations **cut verbatim**
from `App.tsx` (currently at `App.tsx:12-72` and `:74-77`), plus:

```ts
import React from 'react'
import type { TabId } from './types'

export interface TabMeta {
  id: TabId
  label: string
  icon: React.ReactElement
  accent: string
  description: string
}
```

Type `TABS` as `TabMeta[]` and export both arrays. Then in `App.tsx`, delete both declarations and
`import { TABS, FUTURE_TABS } from './tabs'`.

**Do not edit any label, accent, description or icon while moving them.** A diff that changes copy
during a move is impossible to review as a move.

- [ ] **Step 4: Verify the move changed nothing**

```bash
cd frontend && pnpm test tabs App && pnpm exec tsc --noEmit
git diff --stat -- src/App.tsx src/tabs.ts
```

Expected: tests PASS, `tsc` clean. `App.tsx` should show only deletions plus one import line.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/tabs.ts frontend/src/tabs.test.ts frontend/src/App.tsx \
        docs/superpowers/plans/2026-08-28-landing-page.md
git commit -m "refactor(frontend): lift TABS/FUTURE_TABS into src/tabs.ts

The landing page renders one card per tab using the same label, accent and
description the tab strip uses. A second copy would drift the first time a
description is edited. Pure move — no copy changed."
```

---

### Task 6: The mascot asset and `MascotScene`

**Files:**
- Create: `frontend/src/assets/mascot-hero.jpg`
- Create: `frontend/src/components/landing/MascotScene.tsx`
- Create: `frontend/src/components/landing/MascotScene.test.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: nothing.
- Produces, for Task 10: `<MascotScene status={'ok' | 'degraded'} failingRoot={{ name, hint } | null} />`.

**Why and how — read this before writing anything.** Spec §5 records two measured facts that decide
the whole approach, and re-deriving them wastes an hour:

1. **This machine has only `sips`** — no `cwebp`, ImageMagick, Pillow or `pngquant`. PNG-with-alpha at
   a usable size is **672 KB**, heavier than the entire 448 KB app bundle. JPEG at 600px is
   **151 KB** and is the only viable format. **JPEG has no alpha channel.**
2. **The source image is a complete scene** — mascot, cypress avenue, sky, grass — **not a cut-out
   sprite.** Compositing it over hand-drawn vector scenery would layer a photograph onto vector art.

So the image is the **hero backdrop** and the mood is carried by animated SVG overlays and a CSS
colour grade rendered *over* it. **The character's pose does not change between moods** — he is baked
into the photograph. This is a known, accepted limitation (spec §5); do not "fix" it by substituting
drawn artwork.

- [ ] **Step 1: Produce the asset**

```bash
cd /Users/serna/IdeaProjects/pure-scala-ipc-360
SRC=/Users/serna/.claude/image-cache/9778f182-ae15-493c-9d86-0d517e925699/10.png
mkdir -p frontend/src/assets
T=$(mktemp -d)
sips -Z 600 "$SRC" --out "$T/m.png" >/dev/null
sips -s format jpeg -s formatOptions 80 "$T/m.png" --out frontend/src/assets/mascot-hero.jpg >/dev/null
rm -rf "$T"
ls -l frontend/src/assets/mascot-hero.jpg | awk '{print "  bytes:", $5}'
sips -g pixelWidth -g pixelHeight frontend/src/assets/mascot-hero.jpg | tail -2
```

Expected: ~151,000 bytes, 600×600. **If `$SRC` no longer exists** (it is a session-scoped cache),
stop and ask the user to re-supply the mascot image rather than substituting any other artwork.

- [ ] **Step 2: Write the failing test**

```tsx
import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MascotScene } from './MascotScene'

afterEach(cleanup)

describe('MascotScene', () => {
  it('renders the relaxed scene when everything resolved', () => {
    render(<MascotScene status="ok" failingRoot={null} />)

    expect(screen.getByTestId('mascot-scene')).toHaveAttribute('data-mood', 'ok')
    expect(screen.getByTestId('overlay-bubbles')).toBeInTheDocument()
    expect(screen.queryByTestId('overlay-twigs')).not.toBeInTheDocument()
  })

  it('renders the pruning scene when a root is unhealthy', () => {
    render(<MascotScene status="degraded" failingRoot={{ name: 'composer', hint: 'set composerRoot in config.json' }} />)

    expect(screen.getByTestId('mascot-scene')).toHaveAttribute('data-mood', 'degraded')
    expect(screen.getByTestId('overlay-twigs')).toBeInTheDocument()
    expect(screen.queryByTestId('overlay-bubbles')).not.toBeInTheDocument()
  })

  // The mascot IS the readiness indicator — a degraded mood that does not say WHY
  // is just a sad picture. This is the whole point of binding it to diagnostics.
  it('names the failing root and its hint when degraded', () => {
    render(<MascotScene status="degraded" failingRoot={{ name: 'composer', hint: 'set composerRoot in config.json' }} />)

    expect(screen.getByText(/composer/)).toBeInTheDocument()
    expect(screen.getByText(/set composerRoot in config.json/)).toBeInTheDocument()
  })

  it('degrades without a hint rather than rendering an empty callout', () => {
    render(<MascotScene status="degraded" failingRoot={{ name: 'composer', hint: null }} />)

    expect(screen.getByText(/composer/)).toBeInTheDocument()
    expect(screen.getByTestId('mascot-scene')).toHaveAttribute('data-mood', 'degraded')
  })

  it('always renders the hero image, in both moods', () => {
    const { rerender } = render(<MascotScene status="ok" failingRoot={null} />)
    expect(screen.getByRole('img', { name: /mascot/i })).toBeInTheDocument()

    rerender(<MascotScene status="degraded" failingRoot={{ name: 'corpus', hint: null }} />)
    expect(screen.getByRole('img', { name: /mascot/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

```bash
cd frontend && pnpm test MascotScene
```

Expected: FAIL — module not found.

- [ ] **Step 4: Add the keyframes and their reduced-motion rules**

Append to `frontend/src/index.css`, beside the existing `spinner-rotate` block at `:75-86`:

```css
/* Sub-project 11: landing hero motion (animation utilities, not design tokens — ADR-0005,
   same standing as .spinner-arc above). Every one has a reduced-motion counterpart. */
@keyframes mascot-drift { /* slow ken-burns so the still hero breathes */
  0%, 100% { transform: scale(1.04) translate(0, 0); }
  50%      { transform: scale(1.08) translate(-1.2%, -0.8%); }
}
@keyframes bubble-rise {
  0%   { transform: translateY(0) scale(0.7); opacity: 0; }
  15%  { opacity: 0.75; }
  100% { transform: translateY(-140px) scale(1.1); opacity: 0; }
}
@keyframes twig-fall {
  0%   { transform: translate(0, -20px) rotate(0deg); opacity: 0; }
  20%  { opacity: 0.9; }
  100% { transform: translate(-30px, 120px) rotate(220deg); opacity: 0; }
}
.mascot-hero  { animation: mascot-drift 24s ease-in-out infinite; }
.bubble       { animation: bubble-rise 4.5s ease-in infinite; }
.twig         { animation: twig-fall 5s ease-in infinite; }

@media (prefers-reduced-motion: reduce) {
  .mascot-hero, .bubble, .twig { animation: none; }
}
```

- [ ] **Step 5: Write the component**

`MascotScene.tsx` renders, in order:

1. `<img src={mascotHero} alt="ETL 360 mascot among the cypress trees" className="mascot-hero">`,
   imported as `import mascotHero from '../../assets/mascot-hero.jpg'`.
2. A CSS `filter` grade on its wrapper — warm and saturated for `ok`
   (`saturate(1.15) brightness(1.02)`), cooler and flatter for `degraded`
   (`saturate(0.7) brightness(0.9)`) plus a radial-gradient vignette overlay.
3. An inline `<svg>` overlay: for `ok`, `data-testid="overlay-bubbles"` with ~8 `<circle className="bubble">`
   at staggered `animation-delay`s plus two steam paths; for `degraded`,
   `data-testid="overlay-twigs"` with ~6 small `<path className="twig">` and a single shear-glint line.
4. When `status === 'degraded'`, a callout naming `failingRoot.name` and, **only when non-null**,
   `failingRoot.hint`.

The root element carries `data-testid="mascot-scene"` and `data-mood={status}`. Colours come from
existing tokens only (`--text`, `--text-muted`, `--cyan` for bubbles, `--orange` for twigs).

- [ ] **Step 6: Pin the reduced-motion contract — and note the spec's sketch of it was wrong**

Spec §12 lists a `reducedMotion.test.tsx` asserting "no animation classes are applied". **That test
cannot exist as described.** Reduced motion is handled in CSS (`@media (prefers-reduced-motion: reduce)`),
not by a JS branch, so the classes are *always* applied and the media query disables them — which is
the more robust design (it responds to an OS setting changing at runtime, with no re-render). jsdom
computes no media queries, so a component test can observe nothing here.

Assert the thing that can actually regress instead: that **every animation class added has a
reduced-motion counterpart**. Create `frontend/src/components/landing/reducedMotion.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8')

/** Every class this sub-project animates. Add to this list when adding a keyframe. */
const ANIMATED = ['mascot-hero', 'bubble', 'twig']

describe('reduced motion', () => {
  it('has a prefers-reduced-motion block', () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
  })

  // ADR-0005 sanctions animation utilities; it does not sanction ignoring the OS setting.
  it('disables every animated landing class under reduced motion', () => {
    const blocks = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/g) ?? []
    const combined = blocks.join('\n')
    for (const cls of ANIMATED) {
      expect(combined, `.${cls} has no reduced-motion rule`).toContain(cls)
    }
  })
})
```

Run it: `cd frontend && pnpm test reducedMotion` — it must fail if any class in `ANIMATED` is missing
from a reduced-motion block, which you can verify by temporarily deleting one class name from the CSS
rule and re-running.

- [ ] **Step 7: Run the tests, the type check and the build**

```bash
cd frontend && pnpm test MascotScene reducedMotion && pnpm exec tsc --noEmit && pnpm build
ls -l dist/assets/*.jpg 2>/dev/null | awk '{print "  bundled asset bytes:", $5}'
```

Expected: PASS (5 tests), `tsc` clean, build clean, and the bundled JPEG ~151 KB. If the bundle grew
by more than ~200 KB, the wrong asset was committed.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/landing/reducedMotion.test.ts \
        frontend/src/assets/mascot-hero.jpg frontend/src/components/landing/MascotScene.tsx \
        frontend/src/components/landing/MascotScene.test.tsx frontend/src/index.css \
        docs/superpowers/plans/2026-08-28-landing-page.md
git commit -m "feat(landing): mascot scene bound to readiness

The mascot IS the readiness indicator: bubbles and steam over a warm grade when
every root resolved, falling twigs and a shear glint over a cooler one when not,
with the failing root and its ADR-0013 hint named beside him.

The image is the hero backdrop rather than a composited sprite: this machine has
only sips (no cwebp/ImageMagick/Pillow), so PNG-with-alpha is 672 KB against
151 KB for JPEG, and the source is a full scene, not a cut-out. Consequence,
accepted and recorded in the spec: his pose does not change between moods.

Every new keyframe has a prefers-reduced-motion counterpart, following the
spinner-rotate precedent (ADR-0005)."
```

---

# Part 3 — The page

### Task 7: `StatsGrid` and `ProgressStrip`

**Files:**
- Create: `frontend/src/components/landing/StatsGrid.tsx`
- Create: `frontend/src/components/landing/ProgressStrip.tsx`
- Create: `frontend/src/components/landing/StatsGrid.test.tsx`
- Create: `frontend/src/components/landing/ProgressStrip.test.tsx`

**Interfaces:**
- Consumes: `ReadinessT` from `api/readinessQueries.ts`.
- Produces, for Task 10: `<StatsGrid readiness={ReadinessT} />`, `<ProgressStrip progress={ReadinessT['progress']} />`.

**Why:** these are the "prelude of what's coming" — the numbers that tell the user how much is
actually here before they walk in.

- [ ] **Step 1: Write the failing tests**

```tsx
// StatsGrid.test.tsx
import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { StatsGrid } from './StatsGrid'
import type { ReadinessT } from '../../api/readinessQueries'

afterEach(cleanup)

const READY = {
  status: 'ok',
  corpus: { xml: 81, recipes: 86, ddl: 212, dirs: 119, layers: ['CDM', 'DWH', 'ODS'] },
  operational: { clusters: 1284, recipes: 7012, days: 365, rows: 1842000, mode: 'real' },
  dags: { workflows: 23 },
  roots: [], progress: { tasksDone: 596, tasksTotal: 601, adrs: 16 },
} as unknown as ReadinessT

describe('StatsGrid', () => {
  it('shows the corpus, operational and DAG counts', () => {
    render(<StatsGrid readiness={READY} />)

    expect(screen.getByText('81')).toBeInTheDocument()
    expect(screen.getByText('86')).toBeInTheDocument()
    expect(screen.getByText('212')).toBeInTheDocument()
    expect(screen.getByText('23')).toBeInTheDocument()
  })

  // At the real scale this app targets, unseparated digits are unreadable.
  it('formats large numbers with thousands separators', () => {
    render(<StatsGrid readiness={READY} />)

    expect(screen.getByText('1,284')).toBeInTheDocument()
    expect(screen.getByText('7,012')).toBeInTheDocument()
    expect(screen.getByText('1,842,000')).toBeInTheDocument()
  })

  it('names the operational data mode', () => {
    render(<StatsGrid readiness={READY} />)
    expect(screen.getByText(/real/)).toBeInTheDocument()
  })
})
```

```tsx
// ProgressStrip.test.tsx
import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ProgressStrip } from './ProgressStrip'

afterEach(cleanup)

describe('ProgressStrip', () => {
  it('states tasks done against total, and the ADR count', () => {
    render(<ProgressStrip progress={{ tasksDone: 596, tasksTotal: 601, adrs: 16 }} />)

    expect(screen.getByText(/596/)).toBeInTheDocument()
    expect(screen.getByText(/601/)).toBeInTheDocument()
    expect(screen.getByText(/16/)).toBeInTheDocument()
  })

  // A deployment without docs/ serves progress: null. That must be silence, not a broken widget.
  it('renders nothing at all when progress is unavailable', () => {
    const { container } = render(<ProgressStrip progress={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('does not claim a percentage-complete for the product', () => {
    render(<ProgressStrip progress={{ tasksDone: 596, tasksTotal: 601, adrs: 16 }} />)
    expect(screen.queryByText(/99%|complete/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

```bash
cd frontend && pnpm test StatsGrid ProgressStrip
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement both**

`StatsGrid` renders a responsive grid of stat tiles: value in `--text` at a large size in
`JetBrains Mono`, label beneath in `--text-muted`. Tiles: XMLs, recipes, DDLs, layers (corpus);
clusters, recipes, days, b15 rows (operational); DAGs. Format every number with
`new Intl.NumberFormat('en-US')`. Show `operational.mode` as a small chip using the same
`data: real|mock` idiom `DataRootsChip` already uses.

`ProgressStrip` returns `null` when `progress` is falsy — the empty-DOM assertion above is the
contract. Otherwise it renders `{tasksDone} / {tasksTotal} plan tasks` and `{adrs} ADRs`, plus a
thin bar whose width is `tasksDone/tasksTotal`. **Label it as plan tasks, not as product
completeness** — the third test pins that distinction.

Existing tokens only.

- [ ] **Step 4: Run the tests and the type check**

```bash
cd frontend && pnpm test StatsGrid ProgressStrip && pnpm exec tsc --noEmit
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/StatsGrid.tsx \
        frontend/src/components/landing/StatsGrid.test.tsx \
        frontend/src/components/landing/ProgressStrip.tsx \
        frontend/src/components/landing/ProgressStrip.test.tsx \
        docs/superpowers/plans/2026-08-28-landing-page.md
git commit -m "feat(landing): stats grid and progress strip

Thousands separators throughout — at the scale this app targets, unseparated
digits are unreadable. ProgressStrip renders nothing when progress is null (a
deployment without docs/) and reports plan tasks rather than claiming a
percentage-complete for the product."
```

---

### Task 8: `TabPreview` and `EnvironmentPanel`

**Files:**
- Create: `frontend/src/components/landing/TabPreview.tsx`
- Create: `frontend/src/components/landing/EnvironmentPanel.tsx`
- Create: `frontend/src/components/landing/TabPreview.test.tsx`
- Create: `frontend/src/components/landing/EnvironmentPanel.test.tsx`

**Interfaces:**
- Consumes: `TABS`, `FUTURE_TABS` from `src/tabs.ts` (Task 5); `ReadinessT['roots']`; `useAppConfig()` from `api/queries.ts`.
- Produces, for Task 10: `<TabPreview onEnter={(tab: TabId) => void} />`, `<EnvironmentPanel roots={ReadinessT['roots']} />`.

**Why:** the user asked for "a brief introduction what's expected from each tab" and "a way to show the current config.json used".

- [ ] **Step 1: Write the failing tests**

```tsx
// TabPreview.test.tsx
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TabPreview } from './TabPreview'
import { TABS, FUTURE_TABS } from '../../tabs'

afterEach(cleanup)

describe('TabPreview', () => {
  it('renders one card per live tab, from the shared tab metadata', () => {
    render(<TabPreview onEnter={() => {}} />)
    for (const t of TABS) expect(screen.getByText(t.label)).toBeInTheDocument()
  })

  it('renders the not-yet-built tabs as unavailable', () => {
    render(<TabPreview onEnter={() => {}} />)
    for (const t of FUTURE_TABS) expect(screen.getByText(t.label)).toBeInTheDocument()
    expect(screen.getAllByText(/coming soon/i).length).toBe(FUTURE_TABS.length)
  })

  it('enters the app on the clicked tab', () => {
    const onEnter = vi.fn()
    render(<TabPreview onEnter={onEnter} />)

    fireEvent.click(screen.getByRole('button', { name: new RegExp(TABS[2].label) }))

    expect(onEnter).toHaveBeenCalledWith(TABS[2].id)
  })

  it('does not offer entry into a tab that does not exist yet', () => {
    const onEnter = vi.fn()
    render(<TabPreview onEnter={onEnter} />)

    const future = screen.getByText(FUTURE_TABS[0].label).closest('button')
    expect(future).toBeNull()
    expect(onEnter).not.toHaveBeenCalled()
  })
})
```

```tsx
// EnvironmentPanel.test.tsx
import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { EnvironmentPanel } from './EnvironmentPanel'

afterEach(cleanup)

const ROOTS = [
  { name: 'corpus', resolved: '/repo/parser/src/main/resources/xmltobq', tier: 'real', status: 'ok' },
  { name: 'composer', resolved: '/repo/backend/src/main/resources/mock/composer', tier: 'mock', status: 'ok' },
]

describe('EnvironmentPanel', () => {
  it('shows each root with its resolved path and tier', () => {
    render(<EnvironmentPanel roots={ROOTS} />)

    expect(screen.getByText('corpus')).toBeInTheDocument()
    expect(screen.getByText('/repo/parser/src/main/resources/xmltobq')).toBeInTheDocument()
    expect(screen.getByText('mock')).toBeInTheDocument()
  })

  // The panel exists to answer "is this pointed at MY data" — a broken root must say why.
  it('surfaces the hint when a root is unhealthy', () => {
    render(<EnvironmentPanel roots={[
      { name: 'composer', resolved: '/nope', tier: 'absent', status: 'ko',
        hint: 'set composerRoot in config.json' },
    ]} />)

    expect(screen.getByText(/set composerRoot in config.json/)).toBeInTheDocument()
  })

  it('renders nothing rather than an empty frame when roots are missing', () => {
    const { container } = render(<EnvironmentPanel roots={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

```bash
cd frontend && pnpm test TabPreview EnvironmentPanel
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement both**

`TabPreview` maps `TABS` to `<button>` cards (icon, label in the tab's own `accent`, description in
`--text-muted`), each calling `onEnter(tab.id)`. `FUTURE_TABS` render as non-interactive `<div>`s —
**not buttons** — with a "coming soon" chip, matching the existing disabled treatment in `App.tsx`'s
top bar. The fourth test pins that they are not clickable.

`EnvironmentPanel` returns `null` for a falsy/empty `roots`. Otherwise one row per root: name,
resolved path in `JetBrains Mono` (wrapping, not truncated — the whole point is reading it), a tier
chip, and — when `status !== 'ok'` — the `hint`. Follow `DataRootsPanel`'s existing presentation
rather than inventing a second style for the same information.

- [ ] **Step 4: Run the tests and the type check**

```bash
cd frontend && pnpm test TabPreview EnvironmentPanel && pnpm exec tsc --noEmit
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/landing/TabPreview.tsx \
        frontend/src/components/landing/TabPreview.test.tsx \
        frontend/src/components/landing/EnvironmentPanel.tsx \
        frontend/src/components/landing/EnvironmentPanel.test.tsx \
        docs/superpowers/plans/2026-08-28-landing-page.md
git commit -m "feat(landing): tab previews and the environment panel

Tab cards come from the shared tabs.ts so they cannot drift from the strip;
future tabs render as non-interactive, since offering entry to something that
does not exist is worse than not listing it. The environment panel answers 'is
this pointed at my data' and shows the ADR-0013 hint when a root is broken."
```

---

### Task 9: `ArchitectureDiagram`

**Files:**
- Create: `frontend/src/components/landing/ArchitectureDiagram.tsx`
- Create: `frontend/src/components/landing/ArchitectureDiagram.test.tsx`
- Create: `docs/img/etl360-architecture.svg`
- Modify: `README.md`

**Interfaces:**
- Consumes: `TabId` from `types.ts`.
- Produces, for Task 10: `<ArchitectureDiagram onEnter={(tab: TabId) => void} />`.

**Why:** the user asked for a clickable architecture diagram with icons, reused in the README.
Hand-authored SVG (spec §7) — inline in the app so regions are real buttons and it inherits the
theme, and committed as `.svg` for the README, which GitHub renders natively. No mermaid at runtime
or build time, and no new dependency.

**What it depicts** (from `docs/architecture.md`'s existing mermaid, which stays as-is — this is the
illustrated overview, not a replacement):

```
 IPC Powermart XML ──▶ parser/ (Scala 2.12) ──▶ _ETL_*.json recipes + BigQuery DDL
                                                        │
 DWH_CONTROL (control schema) ─┐                        ▼
 composer (b15 CSVs) ──────────┼──────────▶ backend/ (Spring Boot 3.3, parser in-JVM)
 xmltobq (corpus) ─────────────┘                        │
                                                        ▼
                                            frontend/ (React 19 + Vite)
                                     Viewer · Modifier · Operational · DAG
                                                        │
                                    GCP: BigQuery · Dataproc · Cloud Logging
```

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ArchitectureDiagram } from './ArchitectureDiagram'
import { TABS } from '../../tabs'

afterEach(cleanup)

describe('ArchitectureDiagram', () => {
  it('renders the pipeline stages', () => {
    render(<ArchitectureDiagram onEnter={() => {}} />)

    expect(screen.getByText(/Powermart XML/i)).toBeInTheDocument()
    expect(screen.getByText(/parser/i)).toBeInTheDocument()
    expect(screen.getByText(/backend/i)).toBeInTheDocument()
    expect(screen.getByText(/frontend/i)).toBeInTheDocument()
  })

  // Every clickable region must route somewhere real — a dead region is worse than a static image.
  it('every clickable region maps to a real tab id', () => {
    const onEnter = vi.fn()
    render(<ArchitectureDiagram onEnter={onEnter} />)
    const validIds = new Set(TABS.map(t => t.id))

    const regions = screen.getAllByRole('button')
    expect(regions.length).toBeGreaterThan(0)

    for (const r of regions) {
      onEnter.mockClear()
      fireEvent.click(r)
      expect(onEnter).toHaveBeenCalledTimes(1)
      expect(validIds.has(onEnter.mock.calls[0][0])).toBe(true)
    }
  })

  it('routes the recipes region to the modifier and the b15 region to operational', () => {
    const onEnter = vi.fn()
    render(<ArchitectureDiagram onEnter={onEnter} />)

    fireEvent.click(screen.getByRole('button', { name: /recipes/i }))
    expect(onEnter).toHaveBeenCalledWith('modifier')

    onEnter.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /b15|operational/i }))
    expect(onEnter).toHaveBeenCalledWith('operational')
  })

  it('gives every region an accessible name', () => {
    render(<ArchitectureDiagram onEnter={() => {}} />)
    for (const r of screen.getAllByRole('button')) {
      expect(r).toHaveAccessibleName()
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd frontend && pnpm test ArchitectureDiagram
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

One inline `<svg viewBox>` with `role="img"` and a `<title>`. Nodes are drawn as rounded rects with
icon glyphs (Java, Spring, XML, JSON, Airflow, Spark, GCP) as SVG paths, labels in `--text`,
connectors in `--border`. Regions that map to a tab are wrapped in `<button>` (or `<g role="button" tabIndex={0}>`
with a keyboard handler) carrying an `aria-label`, and call `onEnter(id)`:

| Region | Tab |
|---|---|
| Powermart XML / corpus | `viewer` |
| `_ETL_*.json` recipes / DDL | `modifier` |
| composer / b15 / operational | `operational` |
| workflows / DAG | `dag` |

Non-interactive nodes (parser, backend, GCP surfaces) are plain `<g>` — the second test asserts every
`button` routes somewhere, so anything not routable must not be a button.

Existing tokens only. Scale with `viewBox` + `width: 100%` so it is responsive.

- [ ] **Step 4: Export the same artwork for the README**

Save the identical `<svg>` markup as `docs/img/etl360-architecture.svg`, with two changes for
standalone rendering: replace `var(--token)` colours with their literal hex values from
`frontend/src/index.css`, and drop the `<button>`/`role` wrappers (a file has nowhere to navigate).
Add it near the top of `README.md`:

```markdown
![ETL 360 architecture](docs/img/etl360-architecture.svg)
```

Verify it renders standalone:

```bash
python3 -c "import xml.etree.ElementTree as E; E.parse('docs/img/etl360-architecture.svg'); print('valid XML')"
grep -c "var(--" docs/img/etl360-architecture.svg
```

Expected: `valid XML`, and **0** `var(--` occurrences — a CSS variable has no value outside the app.

- [ ] **Step 5: Run the tests, the type check and the build**

```bash
cd frontend && pnpm test ArchitectureDiagram && pnpm exec tsc --noEmit && pnpm build
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/landing/ArchitectureDiagram.tsx \
        frontend/src/components/landing/ArchitectureDiagram.test.tsx \
        docs/img/etl360-architecture.svg README.md \
        docs/superpowers/plans/2026-08-28-landing-page.md
git commit -m "feat(landing): clickable architecture diagram, reused in the README

Hand-authored SVG — inline in the app so its regions are real buttons that enter
on the tab they depict, and committed as .svg for the README, which GitHub
renders natively. No mermaid at runtime or build time and no new dependency.

A test asserts every clickable region routes to a real TabId: a dead region is
worse than a static image. docs/architecture.md's mermaid diagrams stay as the
precise reference; this is the illustrated overview."
```

---

### Task 10: `Landing` and the `App.tsx` view switch

**Files:**
- Create: `frontend/src/components/landing/Landing.tsx`
- Create: `frontend/src/components/landing/Landing.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: everything from Tasks 4, 6, 7, 8, 9.
- Produces: `<Landing onEnter={(tab?: TabId) => void} />`.

**Why:** this is where it becomes the app's first screen.

**Entry rules (spec §8):**
- `view` starts at `'landing'`. **`?focus=<recipePath>` bypasses it entirely**, exactly as it bypasses the tab shell today — focus mode never sees the landing page.
- Entry via the primary button, the `Esc` key, or any diagram/tab-preview region (which enters on that region's tab).
- **Always shown; nothing is persisted.** No "skip intro" flag — which also means there is no persisted value that can wedge the first screen, a hazard this codebase met once already (a corrupt `density` white-screened Tab 3 in sub-project 10).
- The transition is ~400 ms of `opacity`/`transform` only, and is skipped under `prefers-reduced-motion`.

- [ ] **Step 1: Write the failing tests**

```tsx
// Landing.test.tsx
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { Landing } from './Landing'

const READY = {
  status: 'ok',
  corpus: { xml: 81, recipes: 86, ddl: 212, dirs: 119, layers: ['CDM'] },
  operational: { clusters: 21, recipes: 30, days: 14, rows: 417, mode: 'mock' },
  dags: { workflows: 23 },
  roots: [{ name: 'corpus', resolved: '/mock/xmltobq', tier: 'real', status: 'ok' }],
  progress: { tasksDone: 596, tasksTotal: 601, adrs: 16 },
}
const DEGRADED = {
  ...READY, status: 'degraded',
  roots: [{ name: 'composer', resolved: '/nope', tier: 'absent', status: 'ko',
            hint: 'set composerRoot in config.json' }],
}

const server = setupServer(
  http.get('*/api/readiness', () => HttpResponse.json(READY)),
  http.get('*/api/config', () => HttpResponse.json({ gcpProjectId: 'example-project', region: 'eu' })),
)
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => { server.resetHandlers(); cleanup() })
afterAll(() => server.close())

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('Landing', () => {
  it('shows the stats once readiness resolves', async () => {
    render(<Landing onEnter={() => {}} />, { wrapper })
    expect(await screen.findByText('81')).toBeInTheDocument()
    expect(screen.getByText('23')).toBeInTheDocument()
  })

  it('shows the relaxed mascot when everything resolved', async () => {
    render(<Landing onEnter={() => {}} />, { wrapper })
    await waitFor(() => expect(screen.getByTestId('mascot-scene')).toHaveAttribute('data-mood', 'ok'))
  })

  it('shows the pruning mascot and names the failing root when degraded', async () => {
    server.use(http.get('*/api/readiness', () => HttpResponse.json(DEGRADED)))

    render(<Landing onEnter={() => {}} />, { wrapper })

    await waitFor(() => expect(screen.getByTestId('mascot-scene')).toHaveAttribute('data-mood', 'degraded'))
    expect(screen.getByText(/set composerRoot in config.json/)).toBeInTheDocument()
  })

  it('enters on the primary button', async () => {
    const onEnter = vi.fn()
    render(<Landing onEnter={onEnter} />, { wrapper })

    fireEvent.click(await screen.findByRole('button', { name: /enter/i }))

    expect(onEnter).toHaveBeenCalledTimes(1)
  })

  it('enters on Escape', async () => {
    const onEnter = vi.fn()
    render(<Landing onEnter={onEnter} />, { wrapper })
    await screen.findByText('81')

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onEnter).toHaveBeenCalledTimes(1)
  })

  // A readiness failure must not leave a blank hero — the page still introduces the app.
  it('still renders the page when readiness fails to load', async () => {
    server.use(http.get('*/api/readiness', () => new HttpResponse(null, { status: 500 })))

    render(<Landing onEnter={() => {}} />, { wrapper })

    expect(await screen.findByRole('button', { name: /enter/i })).toBeInTheDocument()
    expect(screen.getByText(/could not read|unavailable/i)).toBeInTheDocument()
  })
})
```

Append to `App.test.tsx`:

```tsx
  it('opens on the landing page, not on a tab', async () => {
    render(<App />, { wrapper })
    expect(await screen.findByRole('button', { name: /enter/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /IPC ETL Viewer/ })).not.toBeInTheDocument()
  })

  it('reaches the tab shell after entering', async () => {
    render(<App />, { wrapper })
    fireEvent.click(await screen.findByRole('button', { name: /enter/i }))

    expect(await screen.findByRole('button', { name: /IPC ETL Viewer/ })).toBeInTheDocument()
  })

  // focus mode is a deep link into one recipe — it must not be interrupted by an intro screen.
  it('bypasses the landing page entirely in focus mode', async () => {
    window.history.replaceState({}, '', '/?focus=CDM/m_X/_ETL_m_X.json')
    render(<App />, { wrapper })

    await waitFor(() => expect(screen.queryByRole('button', { name: /enter/i })).not.toBeInTheDocument())
    window.history.replaceState({}, '', '/')
  })
```

- [ ] **Step 2: Run them to verify they fail**

```bash
cd frontend && pnpm test Landing App
```

Expected: FAIL — `Landing` not found; App still opens on a tab.

- [ ] **Step 3: Implement `Landing`**

Composes, top to bottom: `MascotScene` (full-width hero, `status` and the first non-`ok` root from
`readiness.roots` passed in), a title block, the primary **Enter** button, `StatsGrid`,
`TabPreview`, `ArchitectureDiagram`, `ProgressStrip`, `EnvironmentPanel`.

- `useReadiness()` supplies everything. While loading, render the page chrome with the `LoadingState`
  idiom rather than a blank screen.
- **On error, still render the page** with a short "readiness could not be read" note where the stats
  would be. The page's job is to introduce the app; failing to fetch counts must not blank it.
- A `useEffect` binds `keydown` for `Escape` → `onEnter()`, removed on unmount.
- `failingRoot` = the first root whose `status !== 'ok'`, or `null`.

- [ ] **Step 4: Wire `App.tsx`**

```tsx
const [view, setView] = useState<'landing' | 'tabs'>('landing')

const enterApp = (tab?: TabId) => {
  if (tab) showTab(tab)
  setView('tabs')
}
```

Render `<Landing onEnter={enterApp} />` when `view === 'landing'` **and** `!focusRecipe`; otherwise
the existing shell, unchanged. Focus mode keeps its current early branch and never sees the landing
page.

Add the transition to `index.css` beside the other landing keyframes:

```css
@keyframes landing-exit { to { opacity: 0; transform: scale(1.02); } }
@keyframes shell-enter  { from { opacity: 0; transform: scale(0.99); } }
.landing-exit { animation: landing-exit 400ms ease-in forwards; }
.shell-enter  { animation: shell-enter 400ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  .landing-exit, .shell-enter { animation: none; }
}
```

- [ ] **Step 5: Run the full frontend suite, the type check and the build**

```bash
cd frontend && pnpm test && pnpm exec tsc --noEmit && pnpm build
```

Expected: all PASS. Report the measured totals — baseline was 591 tests / 45 files.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/landing/Landing.tsx \
        frontend/src/components/landing/Landing.test.tsx \
        frontend/src/App.tsx frontend/src/App.test.tsx frontend/src/index.css \
        docs/superpowers/plans/2026-08-28-landing-page.md
git commit -m "feat(landing): the app opens on the landing page

A view switch in App.tsx, not a router — the three runtime dependencies stay
three. Enter via the button, Escape, a tab card, or an architecture region
(which enters on that region's tab). Nothing is persisted: no skip-intro flag,
so there is no stored value that can wedge the first screen.

?focus= still bypasses everything, and a readiness fetch failure leaves the page
standing rather than blanking the hero."
```

---

# Part 4 — Gates, docs, acceptance

### Task 11: Gate the endpoint, write ADR-0016, refresh the docs

**Files:**
- Modify: `scripts/validate_loop.sh`
- Create: `docs/adr/0016-landing-readiness-aggregate.md`
- Modify: `docs/architecture.md`
- Modify: `CLAUDE.md`

**Interfaces:** none — gates and prose only.

- [ ] **Step 1: Add the readiness sweep to `validate_loop.sh`**

After the existing cluster-index block, insert:

```bash
echo "[validate-loop] readiness…"
READY=$(curl -sf localhost:8080/api/readiness) || fail "readiness"
echo "$READY" | python3 -c '
import json, sys
d = json.load(sys.stdin)
c, o, g = d["corpus"], d["operational"], d["dags"]
print(f"[validate-loop] readiness: {c["xml"]} xml, {c["recipes"]} recipes, {c["ddl"]} ddl; "
      f"{o["clusters"]} clusters, {o["days"]} days, {o["rows"]} rows; {g["workflows"]} workflows; "
      f"status {d["status"]}")
# Floors from the committed mock. A drop here means a data root flipped or the aggregate regressed.
assert c["xml"] == 81, f"expected 81 xml, got {c["xml"]}"
assert c["recipes"] == 86, f"expected 86 recipes, got {c["recipes"]}"
assert o["clusters"] == 21 and o["days"] == 14 and o["rows"] == 417, "operational floors moved"
# The DAG count is the one number only this endpoint serves — and it must NOT come from the graph.
assert g["workflows"] == 23, f"expected 23 workflows, got {g["workflows"]}"
assert d["status"] in ("ok", "degraded"), "status must mirror diagnostics"
assert len(d["roots"]) == 3, "expected corpus, dwhControl and composer roots"
' || fail "readiness floors"
```

**Note the Python version constraint** already carried by this file: its f-strings use PEP 701
nested same-quotes, which requires **Python ≥3.12**. `/usr/bin/python3` on this machine is 3.9.6;
Homebrew's 3.12 wins `PATH` in a login shell. This is pre-existing (inherited from an earlier
sub-project) — match the existing style rather than diverging, but be aware the gate depends on it.

- [ ] **Step 2: Run the gate**

```bash
make validate-loop
```

Expected: `[validate-loop] PASS`, with the new line printing `81 xml, 86 recipes, 212 ddl; 21 clusters, 14 days, 417 rows; 23 workflows`.

- [ ] **Step 3: Prove the gate actually gates**

```bash
cp scripts/validate_loop.sh /tmp/vl.bak
sed -i '' 's/g\["workflows"\] == 23/g["workflows"] == 99/' scripts/validate_loop.sh
make validate-loop; echo "exit=$?   (must be non-zero)"
cp /tmp/vl.bak scripts/validate_loop.sh && rm /tmp/vl.bak
make validate-loop | tail -1
```

Expected: the tampered run **fails** with a non-zero exit; the restored run PASSes. A gate that
prints numbers without asserting them is not a gate — the previous sub-project's reviewer verified
its floors this way and found them sound; do the same here.

- [ ] **Step 4: Write ADR-0016**

Create `docs/adr/0016-landing-readiness-aggregate.md` from `docs/adr/0000-template.md`, recording:

- **Context:** the app opened on Tab 1's file tree with no statement of what it is or whether it is
  pointed at the user's data; the only diagnosis lived in Tab 3's empty state (ADR-0013), i.e.
  discoverable only after hitting the symptom.
- **Decision:** one `GET /api/readiness` aggregate; the DAG count derived from L2L `workflow` values;
  the backend reading `docs/` for progress, nullable; the mascot bound to readiness.
- **Alternatives rejected, with reasons:**
  - *Four client fetches* — four loading states on the app's first screen, and the DAG count would
    then require the full relationships graph.
  - *DAG count from the relationships graph* (how Tab 4 does it) — pulls the exact payload
    sub-project 10 exists to bound.
  - *A committed `progress.json`* — a second source of truth that drifts the first time a checkbox is
    ticked without regenerating it.
  - *The GitHub API* — `gh` is not installed and the API is unreachable from the app; the plan
    checkboxes are this project's own ledger anyway (`CLAUDE.md`).
  - *A remembered "skip intro" flag* — a persisted value that can wedge the first screen; this
    codebase already had a corrupt persisted `density` white-screen Tab 3.
  - *A pure-SVG mascot* — offered and declined in favour of the user's own image; record the
    consequence, that his pose cannot change between moods.
- **Consequences:** `progress` is nullable and consumers must handle it; the landing page renders
  resolved paths and a GCP project id, so screenshots are mock-tier only (spec §14).

- [ ] **Step 5: Update `docs/architecture.md` and `CLAUDE.md`**

`docs/architecture.md` — add to the endpoint table:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/readiness` | landing-page aggregate: corpus counts, b15 totals, DAG count, resolved roots, repo progress |

and one sentence noting that its DAG count comes from L2L `workflow` values, not the relationships
graph. Leave the existing mermaid diagrams untouched — `docs/img/etl360-architecture.svg` is the
illustrated overview, not a replacement.

`CLAUDE.md` — add the landing page to the frontend description; add `/api/readiness` and its floors
(81/86/212, 21/30/14/417, 23 workflows) to the testing section; extend the ADR range to `0001`–`0016`;
point the current spec/plan at this sub-project.

- [ ] **Step 6: Commit**

```bash
git add scripts/validate_loop.sh docs/adr/0016-landing-readiness-aggregate.md \
        docs/architecture.md CLAUDE.md docs/superpowers/plans/2026-08-28-landing-page.md
git commit -m "docs+gate: readiness floors in validate-loop, ADR-0016, doc refresh

The gate asserts 81/86/212 corpus, 21/30/14/417 operational and 23 workflows,
and was verified to fail when tampered with. ADR-0016 records why the DAG count
comes from L2L entries rather than the relationships graph, why progress is
repo-sourced and nullable, and why no skip-intro flag is persisted."
```

---

### Task 12: Browser acceptance walk

**Files:**
- Create: `docs/img/landing-*.png`
- Modify: `docs/superpowers/specs/2026-08-28-landing-page-design.md` (results section)
- Modify: `docs/visual-guide.md`

**Why:** the deterministic gates prove the mechanisms. They cannot show whether the hero reads well,
whether the mood is legible at a glance, or whether the transition feels like the "click and go" the
user asked for. Only looking can.

- [ ] **Step 1: Run every deterministic gate from clean**

```bash
mvn -q -am -pl backend clean test
grep -ho "<testcase " backend/target/surefire-reports/*.xml | wc -l
grep -l "<failure\|<error" backend/target/surefire-reports/*.xml || echo "no failures"
cd frontend && pnpm test && pnpm exec tsc --noEmit && pnpm build && cd ..
make check
make validate-loop
```

Record the measured totals. **Count `<testcase>` elements** — the `.txt` sum undercounts by the
number of `@Nested` tests.

- [ ] **Step 2: Boot against the committed mock tiers**

```bash
export ETL360_DWH_CONTROL_ROOT="backend/src/main/resources/mock/DWH_CONTROL"
export ETL360_COMPOSER_ROOT="backend/src/main/resources/mock/composer"
make dev
```

Pinning the mock tiers is what makes the screenshots safe to commit (spec §14) — the page renders
resolved paths and a project id, and on a real deployment those are real.

- [ ] **Step 3: Walk it in Chrome at `http://localhost:8443`**

Check and record each:

1. The landing page is what loads — not Tab 1.
2. The mascot is in its **relaxed** mood, with bubbles and steam animating.
3. The stats match the mock floors (81 / 86 / 212, 21 / 30 / 14 / 417, 23 DAGs).
4. Progress and ADR counts render.
5. The environment panel shows the three resolved roots and their tiers.
6. Every architecture region is clickable and lands on the right tab.
7. Each tab card enters on that tab; the two future cards are not clickable.
8. **Enter**, **Esc**, and a region click all reach the shell, and the transition reads as intended.
9. Console clean throughout (`read_console_messages`, no errors or warnings).

Then force the degraded mood and confirm it is legible and names the cause:

```bash
# In a second shell — point one root at nothing and restart the backend only.
export ETL360_COMPOSER_ROOT="/nonexistent-composer-root"
```

10. The mascot switches to **pruning**, twigs fall, the grade cools, and the failing root **and its
    hint** are named on screen.

- [ ] **Step 4: Capture screenshots**

Capture to `docs/img/`: `landing-ready.png`, `landing-degraded.png`, `landing-architecture.png`.
Then verify and check for identifiers before committing:

```bash
file docs/img/landing-*.png && du -sh docs/img
```

**Review each image for real paths or a real project id before committing.** They were captured
against the mock tiers, so they should show mock paths — confirm that rather than assuming it.

- [ ] **Step 5: Record the results in the spec**

Append `## Acceptance walk — results (Task 12, <date>)` to the spec, one line per item above with
**PASS (observed)** or **PENDING** and what was seen. Mark anything not actually observed as PENDING
rather than inferring it from a unit test — an honest PENDING is worth more than an optimistic PASS.
Add the screenshots to `docs/visual-guide.md`.

- [ ] **Step 6: Stop the servers and commit**

```bash
lsof -ti tcp:8080 | xargs kill 2>/dev/null; lsof -ti tcp:8443 | xargs kill 2>/dev/null
git add docs/img docs/visual-guide.md \
        docs/superpowers/specs/2026-08-28-landing-page-design.md \
        docs/superpowers/plans/2026-08-28-landing-page.md
git commit -m "docs: landing page acceptance walk, observed in Chrome

Both mascot moods walked — the degraded one forced by pointing the composer root
at a nonexistent path — plus the stats, the architecture regions, all three entry
paths and the transition. Screenshots captured against the committed mock tiers
and checked for identifiers."
```

- [ ] **Step 7: Finish the branch**

Use `superpowers:finishing-a-development-branch`. Do not merge before every checkbox above is
ticked, every gate is green **from a clean build**, and the acceptance results record an outcome for
each item.

---

## Critical Files for Implementation

Read these before starting; they carry the conventions every task must follow.

| File | Why it matters |
|---|---|
| `docs/superpowers/specs/2026-08-28-landing-page-design.md` | The binding authority. §3 records the measured tooling facts that decide the mascot approach — do not re-derive them. |
| `backend/.../service/DiagnosticsService.java` + `api/dto/DiagnosticsDto.java` | `ReadinessService` mirrors its `status` rather than forming a second opinion. Its three nested records do **not** share one shape — read them before writing the `Root` mapping. |
| `backend/.../service/ClusterIndexService.java` | `index()` calls `fingerprint()`, a stat sweep per dated export. Call it once (ADR-0014). |
| `backend/.../config/RepoRoot.java` | `resolve` **throws** when it finds no `pom.xml`+`parser/` ancestor — one of `ProgressScanner`'s two null paths. |
| `backend/.../service/B15Reader.java` | The fingerprint-cache idiom `ProgressScanner` copies. |
| `backend/.../api/SummaryController.java` | The controller shape to copy: constructor injection, one mapping, no logic. |
| `frontend/src/index.css:75-86` | The `spinner-rotate` precedent: an animation utility with a `prefers-reduced-motion` counterpart. Every new keyframe follows it. |
| `frontend/src/components/tab3/DataRootsPanel.tsx` | The presentation idiom `EnvironmentPanel` reuses rather than inventing a second style for the same information. |
| `frontend/src/App.tsx` | Where the view switch goes; the `?focus=` early branch it must not disturb. |
| `docs/adr/0013-data-root-diagnostics.md` | Why an empty or misconfigured app must explain itself — the reason the mascot is bound to readiness at all. |
| `docs/adr/0014-b15-cluster-index.md` | The once-per-request `index()` discipline and why it exists. |
| `docs/harness.md` | The per-task loop, the gates, and how they compose. |

## Ledger

Tick each `- [ ]` as its step completes and stage this file in the same commit as the task's
changes. The commit history is the resumability record (`CLAUDE.md`, working practices).
