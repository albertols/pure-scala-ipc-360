# ETL 360 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multi-module Maven restructure (Scala parser + Spring Boot 3 backend), read-only REST API over the `xmltobq/` corpus, frontend data layer with a real sidebar tree, dev harness, test infra, and docs/ADR restructure — per the approved spec `docs/superpowers/specs/2026-07-29-etl360-foundation-design.md`.

**Architecture:** Parent Maven aggregator with `parser/` (existing Scala 2.12.18, behavior unchanged) and `backend/` (Spring Boot 3.3, Java 17) which calls the parser in-JVM. The frontend gains an `src/api/` layer (OpenAPI-generated types + TanStack Query) and swaps only the sidebar tree to real data. Figma prototype look is a hard visual contract.

**Tech Stack:** Maven multi-module, Scala 2.12.18, Spring Boot 3.3.4, springdoc-openapi 2.6, JUnit 5 + MockMvc, React 19 + Vite, TanStack Query 5, openapi-typescript, Vitest + React Testing Library + MSW, GNU Make.

## Global Constraints

- **Figma visual contract:** no visual changes to `frontend/` beyond what each task explicitly lists; new UI states reuse tokens from `frontend/src/index.css`.
- **Parser behavior unchanged:** recipe regeneration output must be byte-identical before/after the module move (Task 1 proves it).
- **Corpus safety:** never run generation against `parser/src/main/resources/xmltobq` in place — temp copies only. Never commit `DWH_CONTROL/`.
- **Branch:** all work on `feat/etl360-foundation`.
- **Versions:** Java 17 (backend), Scala 2.12.18 / target 11 (parser), Spring Boot 3.3.4, springdoc 2.6.0, TanStack Query ^5, openapi-typescript ^7, Vitest ^3, MSW ^2.
- **Package roots:** backend Java code under `io.pure360.etl360`; parser stays `io.pure360.ipc`.
- **API path convention:** Spring path patterns only allow `{*var}` as the last segment, so multi-segment endpoints put the verb first: `/api/mappings/dom/{*path}`, `/api/mappings/model/{*path}`, `/api/recipes/{*path}`, `/api/ddl/{*path}`. `mappingPath` = corpus-relative XML path **without** `.xml`. (Deviation from spec §4 table noted; docs task records it.)
- **Expressions origin:** Foundation extracts expressions from XML DOM only (`origin: "xml"`); recipe-side extraction is deferred because the committed recipes have anonymized key names (spec's corpus caveat). The DTO keeps the `origin` field.

## Progress & resume protocol (laptop-restart safe)

- After finishing each task: tick its checkboxes in THIS file, and include this file in that task's commit. The commit is the progress record.
- To resume after any interruption: `git log --oneline` + first unticked checkbox in this file = next step. Verify the previous task's "verify" step still passes before continuing.
- Commit at every task boundary; never batch multiple tasks into one commit.

---

### Task 1: Multi-module restructure (parser module) with regeneration baseline

**Files:**
- Create: `parser/pom.xml`
- Modify: `pom.xml` (becomes parent aggregator)
- Move: `src/` → `parser/src/` (git mv, includes the corpus)
- Modify: `CLAUDE.md` (path quick-patch only; full rewrite in Task 14)

**Interfaces:**
- Produces: Maven modules `io.pure360:parser:0.1.0-SNAPSHOT` and parent `io.pure360:pure-scala-ipc-360:0.1.0-SNAPSHOT` (packaging pom). Parser classes unchanged: `io.pure360.ipc.xmltojson.XMLParser.getParsedXml(java.io.File): Powermart`, `XMLRoot.parsePowermart(scala.xml.Elem): Powermart`.

- [x] **Step 1: Record the baseline — regenerate the corpus outputs from current main into a temp dir**

```bash
BASE=$(mktemp -d)
rsync -a --include='*/' --include='*.xml' --exclude='*' src/main/resources/xmltobq/ "$BASE/xmltobq/"
mvn -q compile exec:java -Dexec.args="--xmlPath $BASE/xmltobq --generateDDLContent --generateRecipe --generateTargetDDL --generateSourceDDL"
find "$BASE/xmltobq" -name '_ETL_*.json' | wc -l   # expect 46
echo "$BASE" > /tmp/etl360_baseline_dir           # remember for step 5
```
Expected: 46 recipes generated, exit 0 (Calcite SQL-parse error logs are normal noise).

- [x] **Step 2: Move code into parser/ and write its pom**

```bash
mkdir parser
git mv src parser/src
```

Create `parser/pom.xml` — the current root pom with a parent block, artifactId `parser`, and no `<groupId>/<version>` of its own:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>io.pure360</groupId>
        <artifactId>pure-scala-ipc-360</artifactId>
        <version>0.1.0-SNAPSHOT</version>
    </parent>
    <artifactId>parser</artifactId>
    <name>parser</name>
    <description>Informatica PowerCenter XML to ETL-recipe JSON parser</description>

    <properties>
        <maven.compiler.source>11</maven.compiler.source>
        <maven.compiler.target>11</maven.compiler.target>
        <scala.version>2.12.18</scala.version>
        <scala.majorVersion>2.12</scala.majorVersion>
        <circe.version>0.14.10</circe.version>
        <calcite.version>1.39.0</calcite.version>
        <scallop.version>5.0.0</scallop.version>
    </properties>
    <!-- dependencies + build: copy VERBATIM from the current root pom.xml
         (scala-library … slf4j-simple; sourceDirectory src/main/scala;
         scala-maven-plugin 4.9.2; exec-maven-plugin 3.5.0 with mainClass
         io.pure360.ipc.xmltojson.XMLParser) -->
</project>
```

- [x] **Step 3: Rewrite the root pom as the aggregator**

Replace the entire root `pom.xml` with:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <groupId>io.pure360</groupId>
    <artifactId>pure-scala-ipc-360</artifactId>
    <version>0.1.0-SNAPSHOT</version>
    <packaging>pom</packaging>
    <name>pure-scala-ipc-360</name>
    <description>ETL 360 suite: IPC XML parser + backend + GUI</description>
    <properties>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>
    <modules>
        <module>parser</module>
    </modules>
</project>
```
(`backend` is added to `<modules>` in Task 2.)

- [x] **Step 4: Build**

Run: `mvn -q compile`
Expected: BUILD SUCCESS for parent + parser.

- [x] **Step 5: Regenerate against a fresh temp copy and diff against the baseline**

```bash
BASE=$(cat /tmp/etl360_baseline_dir)
AFTER=$(mktemp -d)
rsync -a --include='*/' --include='*.xml' --exclude='*' parser/src/main/resources/xmltobq/ "$AFTER/xmltobq/"
mvn -q -pl parser compile exec:java -Dexec.args="--xmlPath $AFTER/xmltobq --generateDDLContent --generateRecipe --generateTargetDDL --generateSourceDDL"
diff -r "$BASE/xmltobq" "$AFTER/xmltobq" && echo IDENTICAL
```
Expected: `IDENTICAL`. If not, STOP — the move broke the parser; fix before continuing.

- [x] **Step 6: Quick-patch CLAUDE.md paths**

In root `CLAUDE.md`, replace `src/main/resources/xmltobq` → `parser/src/main/resources/xmltobq`, `src/main/scala/io/pure360/ipc/` → `parser/src/main/scala/io/pure360/ipc/`, `src/main/resources/DWH_CONTROL/` → `parser/src/main/resources/DWH_CONTROL/`, and the run command → `mvn -q -pl parser compile exec:java -Dexec.args="..."`. Also update `.gitignore` if it references `src/main/resources/DWH_CONTROL` (check with `grep -n DWH_CONTROL .gitignore`).

- [x] **Step 7: Verify nothing tracked was lost, then commit**

```bash
git status --short   # only renames (R) plus the two poms + CLAUDE.md
git add -A && git commit -m "refactor: multi-module Maven — parser module, aggregator root

Regeneration over the full corpus verified byte-identical pre/post move."
```

---

### Task 2: Backend module skeleton — `/api/health` + OpenAPI live

**Files:**
- Create: `backend/pom.xml`
- Create: `backend/src/main/java/io/pure360/etl360/Etl360Application.java`
- Create: `backend/src/main/java/io/pure360/etl360/config/RepoRoot.java`
- Create: `backend/src/main/java/io/pure360/etl360/config/Etl360Properties.java`
- Create: `backend/src/main/resources/application.yml`
- Create: `backend/src/main/java/io/pure360/etl360/api/HealthController.java`
- Test: `backend/src/test/java/io/pure360/etl360/config/RepoRootTest.java`
- Test: `backend/src/test/java/io/pure360/etl360/api/HealthControllerTest.java`
- Modify: root `pom.xml` (add `<module>backend</module>`)

**Interfaces:**
- Produces: `RepoRoot.resolve(Path startDir): Path` (static); `Etl360Properties` bean (prefix `etl360`) with `String corpusRoot, dwhControlRoot, mockRoot, composerRoot` and nested `Gcp gcp {String projectId, region, dataprocJobUrl, dataprocClusterUrl, loggingUrl}`; `Etl360Properties.resolvedCorpusRoot(): Path` (repo-root-resolved). `GET /api/health` → `{"status","corpusRoot","corpusPresent","xmlCount","recipeCount"}` (counts are 0 until Task 3 wires CorpusService).

- [x] **Step 1: Write backend/pom.xml and register the module**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>io.pure360</groupId>
        <artifactId>pure-scala-ipc-360</artifactId>
        <version>0.1.0-SNAPSHOT</version>
    </parent>
    <artifactId>backend</artifactId>
    <name>backend</name>

    <properties>
        <maven.compiler.release>17</maven.compiler.release>
        <spring-boot.version>3.3.4</spring-boot.version>
        <springdoc.version>2.6.0</springdoc.version>
    </properties>

    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-dependencies</artifactId>
                <version>${spring-boot.version}</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
        </dependencies>
    </dependencyManagement>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springdoc</groupId>
            <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
            <version>${springdoc.version}</version>
        </dependency>
        <dependency>
            <groupId>io.pure360</groupId>
            <artifactId>parser</artifactId>
            <version>${project.version}</version>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <version>${spring-boot.version}</version>
            </plugin>
        </plugins>
    </build>
</project>
```

Add `<module>backend</module>` after `<module>parser</module>` in the root pom.

- [x] **Step 2: Write the failing RepoRoot test**

```java
package io.pure360.etl360.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import static org.assertj.core.api.Assertions.*;

class RepoRootTest {
    @Test
    void findsAncestorContainingPomAndParserDir(@TempDir Path tmp) throws Exception {
        Path repo = tmp.resolve("repo");
        Files.createDirectories(repo.resolve("parser"));
        Files.writeString(repo.resolve("pom.xml"), "<project/>");
        Path deep = Files.createDirectories(repo.resolve("backend/target/classes"));
        assertThat(RepoRoot.resolve(deep)).isEqualTo(repo);
    }

    @Test
    void throwsWhenNoRepoRootAbove(@TempDir Path tmp) {
        assertThatThrownBy(() -> RepoRoot.resolve(tmp))
            .isInstanceOf(IllegalStateException.class);
    }
}
```

- [x] **Step 3: Run to verify failure** — Run: `mvn -q -am -pl backend test`
Expected: compile error, `RepoRoot` not found.

- [x] **Step 4: Implement RepoRoot, Etl360Properties, Application, application.yml, HealthController**

`RepoRoot.java`:
```java
package io.pure360.etl360.config;

import java.nio.file.Files;
import java.nio.file.Path;

public final class RepoRoot {
    private RepoRoot() {}

    public static Path resolve(Path startDir) {
        Path dir = startDir.toAbsolutePath().normalize();
        while (dir != null) {
            if (Files.exists(dir.resolve("pom.xml")) && Files.isDirectory(dir.resolve("parser"))) {
                return dir;
            }
            dir = dir.getParent();
        }
        throw new IllegalStateException("Repo root (pom.xml + parser/) not found above " + startDir);
    }
}
```

`Etl360Properties.java`:
```java
package io.pure360.etl360.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.nio.file.Path;

@ConfigurationProperties(prefix = "etl360")
public record Etl360Properties(String corpusRoot, String dwhControlRoot, String mockRoot,
                               String composerRoot, Gcp gcp) {

    public record Gcp(String projectId, String region, String dataprocJobUrl,
                      String dataprocClusterUrl, String loggingUrl) {}

    private static Path resolveAgainstRepoRoot(String p) {
        Path path = Path.of(p);
        if (path.isAbsolute()) return path.normalize();
        return RepoRoot.resolve(Path.of(System.getProperty("user.dir"))).resolve(path).normalize();
    }

    public Path resolvedCorpusRoot()     { return resolveAgainstRepoRoot(corpusRoot); }
    public Path resolvedDwhControlRoot() { return resolveAgainstRepoRoot(dwhControlRoot); }
    public Path resolvedMockRoot()       { return resolveAgainstRepoRoot(mockRoot); }
    public Path resolvedComposerRoot()   { return resolveAgainstRepoRoot(composerRoot); }
}
```

`Etl360Application.java`:
```java
package io.pure360.etl360;

import io.pure360.etl360.config.Etl360Properties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(Etl360Properties.class)
public class Etl360Application {
    public static void main(String[] args) {
        SpringApplication.run(Etl360Application.class, args);
    }
}
```

`application.yml`:
```yaml
server:
  address: 127.0.0.1
  port: 8080
etl360:
  corpus-root: ${ETL360_CORPUS_ROOT:parser/src/main/resources/xmltobq}
  dwh-control-root: ${ETL360_DWH_CONTROL_ROOT:parser/src/main/resources/DWH_CONTROL}
  mock-root: ${ETL360_MOCK_ROOT:backend/src/main/resources/mock}
  composer-root: ${ETL360_COMPOSER_ROOT:parser/src/main/resources/composer}
  gcp:
    project-id: ${ETL360_GCP_PROJECT:db-dev-example-project}
    region: ${ETL360_GCP_REGION:europe-southwest1}
    dataproc-job-url: "https://console.cloud.google.com/dataproc/jobs/{jobId}?project={project}&region={region}"
    dataproc-cluster-url: "https://console.cloud.google.com/dataproc/clusters/{clusterName}?project={project}&region={region}"
    logging-url: "https://console.cloud.google.com/logs/query;query=resource.labels.job_id%3D%22{jobId}%22?project={project}"
```

`HealthController.java` (counts stay 0 until Task 3):
```java
package io.pure360.etl360.api;

import io.pure360.etl360.config.Etl360Properties;
import org.springframework.web.bind.annotation.*;
import java.nio.file.Files;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class HealthController {
    private final Etl360Properties props;
    public HealthController(Etl360Properties props) { this.props = props; }

    @GetMapping("/health")
    public Map<String, Object> health() {
        var corpus = props.resolvedCorpusRoot();
        return Map.of(
            "status", "UP",
            "corpusRoot", corpus.toString(),
            "corpusPresent", Files.isDirectory(corpus),
            "xmlCount", 0,
            "recipeCount", 0);
    }
}
```

`HealthControllerTest.java`:
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
class HealthControllerTest {
    @Autowired MockMvc mvc;

    @Test
    void healthReportsCorpus() throws Exception {
        mvc.perform(get("/api/health"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.status").value("UP"))
           .andExpect(jsonPath("$.corpusPresent").value(true));
    }

    @Test
    void openApiDocsServed() throws Exception {
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk());
    }
}
```

- [x] **Step 5: Run tests** — Run: `mvn -q -am -pl backend test`
Expected: PASS (RepoRootTest 2, HealthControllerTest 2).

- [x] **Step 6: Boot it once for real**

Run: `mvn -q -am -pl backend spring-boot:run &` then `curl -s localhost:8080/api/health` → JSON with `"corpusPresent":true`; `kill %1`.

- [x] **Step 7: Commit** — `git add -A && git commit -m "feat(backend): Spring Boot 3 module, config properties, /api/health, OpenAPI"` (include this plan file with ticked boxes — same for every task's commit below).

---

### Task 3: Corpus tree — `/api/tree` + problem+json handler + real health counts

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/api/dto/TreeNodeDto.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/CorpusService.java`
- Create: `backend/src/main/java/io/pure360/etl360/api/TreeController.java`
- Create: `backend/src/main/java/io/pure360/etl360/api/ApiExceptionHandler.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/support/NotFoundException.java`
- Modify: `backend/src/main/java/io/pure360/etl360/api/HealthController.java`
- Test: `backend/src/test/java/io/pure360/etl360/service/CorpusServiceTest.java`
- Test: `backend/src/test/java/io/pure360/etl360/api/TreeControllerTest.java`
- Create: `backend/src/test/resources/fixture-corpus/CDM/m_FIXTURE.xml` (+ output dir, next step)

**Interfaces:**
- Consumes: `Etl360Properties.resolvedCorpusRoot()`.
- Produces: `record TreeNodeDto(String name, String path, String kind, String layer, Long sizeBytes, String modifiedAt, String mappingPath, Boolean hasRecipe, Boolean hasDdl, List<TreeNodeDto> children)` — `kind` ∈ `"dir" | "outputDir" | "xml" | "json"`; `path` corpus-relative with extension; `mappingPath` only on `xml` nodes (path minus `.xml`); `layer` = first path segment (`"root"` on the root node). `CorpusService.tree(): TreeNodeDto`, `CorpusService.xmlCount(): int`, `CorpusService.recipeCount(): int`, `CorpusService.allXmlPaths(): List<String>` (mappingPaths), `CorpusService.allRecipePaths(): List<String>`. `NotFoundException(String detail)` → 404 problem+json via `ApiExceptionHandler`.

- [x] **Step 1: Create the fixture corpus** (used by unit tests; kept tiny and Powermart-shaped)

`backend/src/test/resources/fixture-corpus/CDM/m_FIXTURE.xml`:
```xml
<?xml version="1.0" encoding="Windows-1252"?>
<POWERMART CREATION_DATE="01/01/2026 00:00:00" REPOSITORY_VERSION="188.97">
  <REPOSITORY NAME="REP_FIXTURE" VERSION="188" CODEPAGE="MS1252" DATABASETYPE="Oracle">
    <FOLDER NAME="FIX_FOLDER" GROUP="" OWNER="fixture" SHARED="NOTSHARED" DESCRIPTION="" PERMISSIONS="rwx------" UUID="00000000-0000-0000-0000-000000000000">
      <SOURCE DBDNAME="FIXDB" DATABASETYPE="Oracle" NAME="SRC_FIXTURE" OWNERNAME="FIX">
        <SOURCEFIELD DATATYPE="varchar2" NAME="COL_A" PRECISION="10" SCALE="0" NULLABLE="NOTNULL"/>
      </SOURCE>
      <TARGET DATABASETYPE="Oracle" NAME="TGT_FIXTURE">
        <TARGETFIELD DATATYPE="varchar2" NAME="COL_A" PRECISION="10" SCALE="0" NULLABLE="NOTNULL"/>
      </TARGET>
      <TRANSFORMATION DESCRIPTION="" NAME="EXP_FIX" OBJECTVERSION="1" REUSABLE="NO" TYPE="Expression" VERSIONNUMBER="1">
        <TRANSFORMFIELD DATATYPE="string" NAME="COL_A_OUT" PORTTYPE="OUTPUT" PRECISION="10" SCALE="0" EXPRESSION="LTRIM(RTRIM(COL_A)) || &gt;CHR(39)"/>
      </TRANSFORMATION>
      <MAPPING DESCRIPTION="" ISVALID="YES" NAME="m_FIXTURE" OBJECTVERSION="1" VERSIONNUMBER="1">
        <CONNECTOR FROMINSTANCE="SRC_FIXTURE" FROMINSTANCETYPE="Source Definition" FROMFIELD="COL_A" TOINSTANCE="EXP_FIX" TOINSTANCETYPE="Expression" TOFIELD="COL_A"/>
      </MAPPING>
    </FOLDER>
  </REPOSITORY>
</POWERMART>
```

`backend/src/test/resources/fixture-corpus/CDM/m_FIXTURE/_ETL_m_FIXTURE.json`:
```json
{"name": "m_FIXTURE", "source": {"table": "SRC_FIXTURE"}, "target": {"table": "TGT_FIXTURE"}}
```

`backend/src/test/resources/fixture-corpus/CDM/m_FIXTURE/TGT_FIXTURE.json`:
```json
[{"name": "COL_A", "type": "STRING", "mode": "REQUIRED"}]
```

- [x] **Step 2: Write the failing CorpusService test**

```java
package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.TreeNodeDto;
import org.junit.jupiter.api.Test;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.assertThat;

class CorpusServiceTest {
    private final CorpusService service =
        new CorpusService(Path.of("src/test/resources/fixture-corpus"));

    @Test
    void buildsTreeWithLayersKindsAndFlags() {
        TreeNodeDto root = service.tree();
        assertThat(root.kind()).isEqualTo("dir");
        assertThat(root.layer()).isEqualTo("root");
        TreeNodeDto cdm = root.children().get(0);
        assertThat(cdm.name()).isEqualTo("CDM");
        assertThat(cdm.layer()).isEqualTo("CDM");
        TreeNodeDto xml = cdm.children().stream()
            .filter(n -> n.kind().equals("xml")).findFirst().orElseThrow();
        assertThat(xml.path()).isEqualTo("CDM/m_FIXTURE.xml");
        assertThat(xml.mappingPath()).isEqualTo("CDM/m_FIXTURE");
        assertThat(xml.hasRecipe()).isTrue();
        assertThat(xml.hasDdl()).isTrue();
        assertThat(xml.sizeBytes()).isPositive();
        assertThat(xml.modifiedAt()).isNotBlank();
        TreeNodeDto out = cdm.children().stream()
            .filter(n -> n.kind().equals("outputDir")).findFirst().orElseThrow();
        assertThat(out.children()).extracting(TreeNodeDto::kind).containsOnly("json");
    }

    @Test
    void countsMatchFixture() {
        assertThat(service.xmlCount()).isEqualTo(1);
        assertThat(service.recipeCount()).isEqualTo(1);
        assertThat(service.allXmlPaths()).containsExactly("CDM/m_FIXTURE");
        assertThat(service.allRecipePaths()).containsExactly("CDM/m_FIXTURE/_ETL_m_FIXTURE.json");
    }
}
```

- [x] **Step 3: Run to verify failure** — Run: `mvn -q -am -pl backend test -Dtest=CorpusServiceTest`
Expected: compile error, `CorpusService` not found.

- [x] **Step 4: Implement**

`TreeNodeDto.java`:
```java
package io.pure360.etl360.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record TreeNodeDto(String name, String path, String kind, String layer,
                          Long sizeBytes, String modifiedAt, String mappingPath,
                          Boolean hasRecipe, Boolean hasDdl, List<TreeNodeDto> children) {}
```

`CorpusService.java` — constructor takes `Path corpusRoot`; a `@Configuration` factory method (or `@Service` with `Etl360Properties` constructor + this-delegation) wires the default. Walk rules:
- Directories → `kind:"dir"`, except a directory whose name matches a sibling `<name>.xml` → `kind:"outputDir"`.
- `*.xml` files → `kind:"xml"`, `mappingPath` = relative path minus `.xml`, `hasRecipe` = output dir contains `_ETL_*.json`, `hasDdl` = output dir contains at least one `*.json` not starting with `_ETL_` or `_sqlTranslations`.
- `*.json` files → `kind:"json"`. Other files skipped. Children sorted: dirs first, then files, alphabetical.
- `layer` = first segment of the relative path, `"root"` for the root node. `modifiedAt` = ISO-8601 UTC from `Files.getLastModifiedTime`.
- Cache the built tree with the corpus root dir's latest mtime… **skip caching here** (YAGNI — a full walk of 22 MB is milliseconds; DOM/model caching arrives in Task 4 where it matters).

```java
package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.TreeNodeDto;
import io.pure360.etl360.config.Etl360Properties;
import org.springframework.stereotype.Service;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.*;
import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.Stream;

@Service
public class CorpusService {
    private final Path root;

    @org.springframework.beans.factory.annotation.Autowired
    public CorpusService(Etl360Properties props) { this(props.resolvedCorpusRoot()); }
    public CorpusService(Path corpusRoot) { this.root = corpusRoot.normalize(); }
    // @Autowired disambiguates: Spring refuses beans with two non-default constructors otherwise.

    public TreeNodeDto tree() {
        return dirNode(root, "root");
    }

    private TreeNodeDto dirNode(Path dir, String layerOfRoot) {
        List<TreeNodeDto> children = new ArrayList<>();
        try (Stream<Path> list = Files.list(dir)) {
            List<Path> entries = list.sorted(Comparator
                .comparing((Path p) -> Files.isDirectory(p) ? 0 : 1)
                .thenComparing(p -> p.getFileName().toString())).toList();
            for (Path p : entries) {
                String name = p.getFileName().toString();
                if (Files.isDirectory(p)) {
                    children.add(dirNode(p, null));
                } else if (name.endsWith(".xml")) {
                    children.add(xmlNode(p));
                } else if (name.endsWith(".json")) {
                    children.add(leaf(p, "json"));
                }
            }
        } catch (IOException e) { throw new UncheckedIOException(e); }
        String rel = relative(dir);
        String kind = isOutputDir(dir) ? "outputDir" : "dir";
        return new TreeNodeDto(dir.equals(root) ? root.getFileName().toString() : dir.getFileName().toString(),
            rel, kind, layerOf(rel, layerOfRoot), null, null, null, null, null, children);
    }

    private TreeNodeDto xmlNode(Path p) {
        String rel = relative(p);
        String mappingPath = rel.substring(0, rel.length() - ".xml".length());
        Path outDir = p.resolveSibling(p.getFileName().toString().replaceFirst("\\.xml$", ""));
        boolean hasRecipe = false, hasDdl = false;
        if (Files.isDirectory(outDir)) {
            try (Stream<Path> out = Files.list(outDir)) {
                for (Path f : out.toList()) {
                    String n = f.getFileName().toString();
                    if (n.startsWith("_ETL_") && n.endsWith(".json")) hasRecipe = true;
                    else if (n.endsWith(".json") && !n.startsWith("_sqlTranslations")) hasDdl = true;
                }
            } catch (IOException e) { throw new UncheckedIOException(e); }
        }
        TreeNodeDto leaf = leaf(p, "xml");
        return new TreeNodeDto(leaf.name(), leaf.path(), "xml", leaf.layer(),
            leaf.sizeBytes(), leaf.modifiedAt(), mappingPath, hasRecipe, hasDdl, null);
    }

    private TreeNodeDto leaf(Path p, String kind) {
        try {
            String rel = relative(p);
            return new TreeNodeDto(p.getFileName().toString(), rel, kind, layerOf(rel, null),
                Files.size(p),
                Files.getLastModifiedTime(p).toInstant().atOffset(ZoneOffset.UTC).toString(),
                null, null, null, null);
        } catch (IOException e) { throw new UncheckedIOException(e); }
    }

    private boolean isOutputDir(Path dir) {
        return Files.exists(dir.resolveSibling(dir.getFileName().toString() + ".xml"));
    }

    private String relative(Path p) { return root.relativize(p).toString().replace('\\', '/'); }

    private String layerOf(String rel, String rootLayer) {
        if (rootLayer != null || rel.isEmpty()) return rootLayer != null ? rootLayer : "root";
        int slash = rel.indexOf('/');
        return slash < 0 ? rel : rel.substring(0, slash);
    }

    public int xmlCount() { return allXmlPaths().size(); }
    public int recipeCount() { return allRecipePaths().size(); }

    public List<String> allXmlPaths() {
        return collect(".xml").stream()
            .map(r -> r.substring(0, r.length() - ".xml".length())).toList();
    }

    public List<String> allRecipePaths() {
        return collect(".json").stream()
            .filter(r -> r.substring(r.lastIndexOf('/') + 1).startsWith("_ETL_")).toList();
    }

    private List<String> collect(String ext) {
        try (Stream<Path> walk = Files.walk(root)) {
            return walk.filter(Files::isRegularFile)
                .filter(p -> p.getFileName().toString().endsWith(ext))
                .map(this::relative).sorted().toList();
        } catch (IOException e) { throw new UncheckedIOException(e); }
    }
}
```
Note the fixture layer assertion: the root node's direct child dirs get their own name as layer via `layerOf(rel, null)` — verify test passes; adjust only if red.

`NotFoundException.java`:
```java
package io.pure360.etl360.service.support;

public class NotFoundException extends RuntimeException {
    public NotFoundException(String detail) { super(detail); }
}
```

`ApiExceptionHandler.java`:
```java
package io.pure360.etl360.api;

import io.pure360.etl360.service.support.NotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(NotFoundException.class)
    ProblemDetail notFound(NotFoundException e) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
        pd.setTitle("Not found");
        return pd;
    }
}
```

`TreeController.java`:
```java
package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.TreeNodeDto;
import io.pure360.etl360.service.CorpusService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class TreeController {
    private final CorpusService corpus;
    public TreeController(CorpusService corpus) { this.corpus = corpus; }

    @GetMapping("/tree")
    public TreeNodeDto tree() { return corpus.tree(); }
}
```

Modify `HealthController` to take `CorpusService` and return real `xmlCount`/`recipeCount`.

`TreeControllerTest.java` (slice over the real corpus via default config):
```java
package io.pure360.etl360.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import static org.hamcrest.Matchers.greaterThan;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class TreeControllerTest {
    @Autowired MockMvc mvc;

    @Test
    void servesRealCorpusTree() throws Exception {
        mvc.perform(get("/api/tree"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.kind").value("dir"))
           .andExpect(jsonPath("$.children.length()").value(greaterThan(3)));
    }

    @Test
    void healthNowReportsRealCounts() throws Exception {
        mvc.perform(get("/api/health"))
           .andExpect(jsonPath("$.xmlCount").value(greaterThan(40)))
           .andExpect(jsonPath("$.recipeCount").value(greaterThan(60)));
    }
}
```

- [x] **Step 5: Run all backend tests** — Run: `mvn -q -am -pl backend test`
Expected: PASS.

- [x] **Step 6: Commit** — `git add -A && git commit -m "feat(backend): /api/tree corpus tree, problem+json 404, real health counts"`

---

### Task 4: Lossless DOM — `/api/mappings/dom/{*path}`

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/api/dto/XmlNodeDto.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/support/PathResolver.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/support/InvalidCorpusPathException.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/support/XmlUnparsableException.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/DomService.java`
- Create: `backend/src/main/java/io/pure360/etl360/api/MappingController.java`
- Modify: `backend/src/main/java/io/pure360/etl360/api/ApiExceptionHandler.java`
- Test: `backend/src/test/java/io/pure360/etl360/service/DomServiceTest.java`
- Test: `backend/src/test/java/io/pure360/etl360/service/support/PathResolverTest.java`
- Test: `backend/src/test/java/io/pure360/etl360/api/MappingControllerTest.java`

**Interfaces:**
- Consumes: `Etl360Properties.resolvedCorpusRoot()`, fixture corpus from Task 3.
- Produces: `record XmlNodeDto(String name, Map<String,String> attributes, String text, List<XmlNodeDto> children)`; `PathResolver.xmlFile(String mappingPath): Path` and `PathResolver.insideCorpus(String relPath): Path` (throws `InvalidCorpusPathException` → 400, `NotFoundException` → 404); `DomService.dom(String mappingPath): XmlNodeDto` (throws `XmlUnparsableException` → 422, message mentions possible anonymizer entity damage); mtime-keyed cache inside DomService. `GET /api/mappings/dom/{*path}`.

- [x] **Step 1: Write failing DomService + PathResolver tests**

```java
package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.XmlNodeDto;
import org.junit.jupiter.api.Test;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.*;

class DomServiceTest {
    private final DomService service = new DomService(
        new io.pure360.etl360.service.support.PathResolver(Path.of("src/test/resources/fixture-corpus")));

    @Test
    void losslessDomOfFixture() {
        XmlNodeDto root = service.dom("CDM/m_FIXTURE");
        assertThat(root.name()).isEqualTo("POWERMART");
        assertThat(root.attributes()).containsEntry("REPOSITORY_VERSION", "188.97");
        XmlNodeDto folder = root.children().get(0).children().get(0);
        assertThat(folder.name()).isEqualTo("FOLDER");
        assertThat(folder.attributes()).containsEntry("NAME", "FIX_FOLDER");
        // every element level preserved: SOURCE, TARGET, TRANSFORMATION, MAPPING
        assertThat(folder.children()).extracting(XmlNodeDto::name)
            .containsExactly("SOURCE", "TARGET", "TRANSFORMATION", "MAPPING");
        // entity &gt; decoded losslessly inside attribute
        XmlNodeDto field = folder.children().get(2).children().get(0);
        assertThat(field.attributes().get("EXPRESSION")).contains(">CHR(39)");
    }

    @Test
    void missingMappingIs404() {
        assertThatThrownBy(() -> service.dom("CDM/nope"))
            .isInstanceOf(io.pure360.etl360.service.support.NotFoundException.class);
    }
}
```

```java
package io.pure360.etl360.service.support;

import org.junit.jupiter.api.Test;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.*;

class PathResolverTest {
    private final PathResolver resolver = new PathResolver(Path.of("src/test/resources/fixture-corpus"));

    @Test
    void traversalRejected() {
        assertThatThrownBy(() -> resolver.xmlFile("../../../etc/passwd"))
            .isInstanceOf(InvalidCorpusPathException.class);
    }

    @Test
    void resolvesExistingXml() {
        assertThat(resolver.xmlFile("CDM/m_FIXTURE")).exists();
    }
}
```

- [x] **Step 2: Run to verify failure** — Run: `mvn -q -am -pl backend test -Dtest='DomServiceTest,PathResolverTest'`
Expected: compile errors (classes missing).

- [x] **Step 3: Implement**

`PathResolver.java`:
```java
package io.pure360.etl360.service.support;

import io.pure360.etl360.config.Etl360Properties;
import org.springframework.stereotype.Component;
import java.nio.file.Files;
import java.nio.file.Path;

@Component
public class PathResolver {
    private final Path corpus;

    @org.springframework.beans.factory.annotation.Autowired
    public PathResolver(Etl360Properties props) { this(props.resolvedCorpusRoot()); }
    public PathResolver(Path corpusRoot) { this.corpus = corpusRoot.toAbsolutePath().normalize(); }
    // @Autowired disambiguates the two-constructor bean, same as CorpusService.

    public Path insideCorpus(String relPath) {
        Path p = corpus.resolve(relPath).normalize();
        if (!p.startsWith(corpus)) {
            throw new InvalidCorpusPathException("Path escapes corpus root: " + relPath);
        }
        return p;
    }

    public Path xmlFile(String mappingPath) {
        Path p = insideCorpus(mappingPath + ".xml");
        if (!Files.isRegularFile(p)) {
            throw new NotFoundException("No mapping XML at " + mappingPath);
        }
        return p;
    }

    public Path corpusRoot() { return corpus; }
}
```

`InvalidCorpusPathException` / `XmlUnparsableException`: same shape as `NotFoundException` (message-only constructors), package `service.support`.

`XmlNodeDto.java`:
```java
package io.pure360.etl360.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record XmlNodeDto(String name, Map<String, String> attributes,
                         String text, List<XmlNodeDto> children) {}
```

`DomService.java`:
```java
package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.XmlNodeDto;
import io.pure360.etl360.service.support.PathResolver;
import io.pure360.etl360.service.support.XmlUnparsableException;
import org.springframework.stereotype.Service;
import org.w3c.dom.*;
import org.xml.sax.SAXException;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class DomService {
    private record CacheEntry(long mtime, XmlNodeDto dom) {}
    private final PathResolver paths;
    private final Map<String, CacheEntry> cache = new ConcurrentHashMap<>();

    public DomService(PathResolver paths) { this.paths = paths; }

    public XmlNodeDto dom(String mappingPath) {
        Path file = paths.xmlFile(mappingPath);
        try {
            long mtime = Files.getLastModifiedTime(file).toMillis();
            CacheEntry hit = cache.get(mappingPath);
            if (hit != null && hit.mtime() == mtime) return hit.dom();
            XmlNodeDto dom = convert(parse(file).getDocumentElement());
            cache.put(mappingPath, new CacheEntry(mtime, dom));
            return dom;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private Document parse(Path file) {
        try {
            DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
            f.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            f.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            f.setFeature("http://xml.org/sax/features/external-general-entities", false);
            f.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            f.setExpandEntityReferences(false);
            return f.newDocumentBuilder().parse(file.toFile());
        } catch (SAXException e) {
            throw new XmlUnparsableException("XML parse failed for " + file.getFileName() + ": "
                + e.getMessage() + " (if this mentions an undeclared entity, suspect anonymizer damage)");
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private XmlNodeDto convert(Element el) {
        Map<String, String> attrs = new LinkedHashMap<>();
        NamedNodeMap map = el.getAttributes();
        for (int i = 0; i < map.getLength(); i++) {
            attrs.put(map.item(i).getNodeName(), map.item(i).getNodeValue());
        }
        List<XmlNodeDto> children = new ArrayList<>();
        StringBuilder text = new StringBuilder();
        NodeList nodes = el.getChildNodes();
        for (int i = 0; i < nodes.getLength(); i++) {
            Node n = nodes.item(i);
            if (n.getNodeType() == Node.ELEMENT_NODE) children.add(convert((Element) n));
            else if (n.getNodeType() == Node.TEXT_NODE || n.getNodeType() == Node.CDATA_SECTION_NODE) {
                text.append(n.getNodeValue());
            }
        }
        String t = text.toString().strip();
        return new XmlNodeDto(el.getTagName(), attrs.isEmpty() ? null : attrs,
            t.isEmpty() ? null : t, children.isEmpty() ? null : children);
    }
}
```
(Add `import java.io.UncheckedIOException;`. Mixed-content ordering is not preserved — Powermart has none; documented in ADR-0002.)

`MappingController.java`:
```java
package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.XmlNodeDto;
import io.pure360.etl360.service.DomService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/mappings")
public class MappingController {
    private final DomService domService;
    public MappingController(DomService domService) { this.domService = domService; }

    @GetMapping("/dom/{*path}")
    public XmlNodeDto dom(@PathVariable String path) {
        return domService.dom(stripLeadingSlash(path));
    }

    static String stripLeadingSlash(String p) { return p.startsWith("/") ? p.substring(1) : p; }
}
```
(Spring's `{*path}` capture includes the leading `/`.)

Extend `ApiExceptionHandler` with:
```java
@ExceptionHandler(InvalidCorpusPathException.class)
ProblemDetail badPath(InvalidCorpusPathException e) {
    ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
    pd.setTitle("Invalid path");
    return pd;
}

@ExceptionHandler(XmlUnparsableException.class)
ProblemDetail unparsable(XmlUnparsableException e) {
    ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY, e.getMessage());
    pd.setTitle("XML unparsable");
    return pd;
}
```

`MappingControllerTest.java` — `@SpringBootTest @AutoConfigureMockMvc`; cases: real corpus `GET /api/mappings/dom/CDM/m_DM_INFOHUB_BIZLINK` → 200 + `$.name == "POWERMART"`; `GET /api/mappings/dom/CDM/missing` → 404 + `$.title == "Not found"` + content type `application/problem+json`; `GET /api/mappings/dom/..%2F..%2Fetc` → 400.

- [x] **Step 4: Run all backend tests** — Run: `mvn -q -am -pl backend test`
Expected: PASS.

- [x] **Step 5: Commit** — `git add -A && git commit -m "feat(backend): lossless DOM endpoint with mtime cache, 400/422 problem+json"`

---

### Task 5: Semantic model — `/api/mappings/model/{*path}`

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/api/dto/MappingModelDto.java` (single file, nested records)
- Create: `backend/src/main/java/io/pure360/etl360/service/support/ScalaBridge.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/SemanticModelService.java`
- Modify: `backend/src/main/java/io/pure360/etl360/api/MappingController.java`
- Test: `backend/src/test/java/io/pure360/etl360/service/SemanticModelServiceTest.java`

**Interfaces:**
- Consumes: `PathResolver.xmlFile`, parser statics `io.pure360.ipc.xmltojson.XMLParser.getParsedXml(File): XMLRoot.Powermart` (raw parse — no `XMLReplacementExecutor.preparePowermart`, which applies recipe-oriented renames the Viewer must not see).
- Produces: `MappingModelDto` with nested records — top level: `record MappingModelDto(String creationDate, String repositoryVersion, RepositoryDto repository)`; `record RepositoryDto(String name, String version, String codepage, String databaseType, FolderDto folder)`; `record FolderDto(String name, String group, String owner, String shared, String description, String permissions, String uuid, List<SourceDto> sources, List<TargetDto> targets, List<TransformationDto> transformations, List<MappletDto> mapplets, List<MappingDto> mappings)`. `SemanticModelService.model(String mappingPath): MappingModelDto` with the same mtime-cache pattern as DomService.

- [x] **Step 1: Write the failing test** (real corpus file — committed, so deterministic)

```java
package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.MappingModelDto;
import io.pure360.etl360.config.RepoRoot;
import io.pure360.etl360.service.support.PathResolver;
import org.junit.jupiter.api.Test;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.assertThat;

class SemanticModelServiceTest {
    private final SemanticModelService service = new SemanticModelService(new PathResolver(
        RepoRoot.resolve(Path.of(".")).resolve("parser/src/main/resources/xmltobq")));

    @Test
    void parsesRealMappingViaScalaParser() {
        MappingModelDto m = service.model("CDM/m_DM_INFOHUB_BIZLINK");
        assertThat(m.repository().name()).isNotBlank();
        assertThat(m.repository().folder().name()).isNotBlank();
        assertThat(m.repository().folder().mappings()).isNotEmpty();
        assertThat(m.repository().folder().sources()).isNotEmpty();
    }
}
```

- [x] **Step 2: Run to verify failure** — Run: `mvn -q -am -pl backend test -Dtest=SemanticModelServiceTest`
Expected: compile error.

- [x] **Step 3: Implement**

`ScalaBridge.java`:
```java
package io.pure360.etl360.service.support;

import scala.collection.JavaConverters;
import java.util.List;

public final class ScalaBridge {
    private ScalaBridge() {}
    public static <T> List<T> list(scala.collection.Seq<T> seq) {
        return JavaConverters.seqAsJavaListConverter(seq).asJava();
    }
}
```

`MappingModelDto.java` — **mechanical mirroring rule:** every DTO record mirrors its Scala case class field-for-field (same names, camelCase already matches). The Powermart/Repository/Folder levels are fixed above. For the leaf levels, open each file and copy the case-class field list exactly:
- `parser/src/main/scala/io/pure360/ipc/xmltojson/nodes/Source.scala` → `SourceDto` (+ its field case class → `SourceFieldDto`)
- `.../Target.scala` → `TargetDto` (+ `TargetFieldDto`)
- `.../Transformation.scala` → `TransformationDto` (`case class Transformation(description, name, …)` at ~line 85), `TransformFieldDto` (~line 104, includes the expression-bearing fields), `TableAttributeDto(name, value)` (line 83)
- `.../Mapping.scala` → `MappingDto` (+ connector/instance case classes it contains → `ConnectorDto`, `InstanceDto`, …)
- `.../Mapplet.scala` → `MappletDto`

Where a case-class field is itself a `Seq[X]`, the DTO field is `List<XDto>` converted via `ScalaBridge.list(...)`. Where it's another case class, nest the corresponding DTO. No field may be dropped — the mirroring must be exhaustive per file (this is the semantic half of the full-fidelity guarantee; the DOM endpoint is the lossless backstop).

`SemanticModelService.java`:
```java
package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.MappingModelDto;
import io.pure360.etl360.service.support.PathResolver;
import io.pure360.ipc.xmltojson.XMLParser;
import io.pure360.ipc.xmltojson.nodes.XMLRoot;
import org.springframework.stereotype.Service;
import java.io.UncheckedIOException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class SemanticModelService {
    private record CacheEntry(long mtime, MappingModelDto model) {}
    private final PathResolver paths;
    private final Map<String, CacheEntry> cache = new ConcurrentHashMap<>();

    public SemanticModelService(PathResolver paths) { this.paths = paths; }

    public MappingModelDto model(String mappingPath) {
        Path file = paths.xmlFile(mappingPath);
        try {
            long mtime = Files.getLastModifiedTime(file).toMillis();
            CacheEntry hit = cache.get(mappingPath);
            if (hit != null && hit.mtime() == mtime) return hit.model();
            XMLRoot.Powermart pm = XMLParser.getParsedXml(file.toFile());
            MappingModelDto dto = PowermartMapper.toDto(pm);   // static mapper next to the DTO
            cache.put(mappingPath, new CacheEntry(mtime, dto));
            return dto;
        } catch (IOException e) { throw new UncheckedIOException(e); }
    }
}
```
`PowermartMapper` is a static helper class in the DTO file's package (`api/dto/PowermartMapper.java`) doing the field-by-field mapping with `ScalaBridge.list`. If `XMLParser.getParsedXml` isn't reachable as a Java static (no static forwarder), call `XMLParser$.MODULE$.getParsedXml(file)` instead — check compilation and use whichever resolves.

Add to `MappingController`:
```java
@GetMapping("/model/{*path}")
public MappingModelDto model(@PathVariable String path) {
    return modelService.model(stripLeadingSlash(path));
}
```
(constructor-inject `SemanticModelService modelService` alongside `domService`).

- [x] **Step 4: Run all backend tests** — Run: `mvn -q -am -pl backend test`
Expected: PASS. Also spot-check: boot the app, `curl -s localhost:8080/api/mappings/model/CDM/m_DM_INFOHUB_BIZLINK | head -c 400`.

- [x] **Step 5: Commit** — `git add -A && git commit -m "feat(backend): semantic model endpoint via in-JVM Scala parser"`

---

### Task 6: Recipes + DDL — `/api/recipes/{*path}`, `/api/ddl/{*path}`

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/api/dto/RecipeDto.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/RecipeService.java`
- Create: `backend/src/main/java/io/pure360/etl360/api/RecipeController.java`
- Create: `backend/src/main/java/io/pure360/etl360/api/DdlController.java`
- Test: `backend/src/test/java/io/pure360/etl360/service/RecipeServiceTest.java`
- Test: `backend/src/test/java/io/pure360/etl360/api/RecipeAndDdlControllerTest.java`

**Interfaces:**
- Consumes: `PathResolver.insideCorpus`.
- Produces: `record RecipeDto(String path, String fileName, long sizeBytes, String modifiedAt, com.fasterxml.jackson.databind.JsonNode content)`; `RecipeService.recipe(String relJsonPath): RecipeDto` (404 when absent; path must end `.json`); `RecipeService.ddls(String mappingDirRel): Map<String, JsonNode>` keyed by filename minus `.json`, excluding `_ETL_*` and `_sqlTranslations*`. `GET /api/recipes/{*path}` (path = corpus-relative recipe file), `GET /api/ddl/{*path}` (path = mapping output dir).

- [x] **Step 1: Write failing tests** — `RecipeServiceTest` against the fixture corpus: `recipe("CDM/m_FIXTURE/_ETL_m_FIXTURE.json")` returns content with `name == "m_FIXTURE"` and metadata populated; `ddls("CDM/m_FIXTURE")` returns exactly key `TGT_FIXTURE`; `recipe("CDM/m_FIXTURE/nope.json")` throws `NotFoundException`.

```java
package io.pure360.etl360.service;

import org.junit.jupiter.api.Test;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.*;

class RecipeServiceTest {
    private final RecipeService service = new RecipeService(
        new io.pure360.etl360.service.support.PathResolver(Path.of("src/test/resources/fixture-corpus")));

    @Test
    void readsRecipeWithMetadata() {
        var r = service.recipe("CDM/m_FIXTURE/_ETL_m_FIXTURE.json");
        assertThat(r.content().get("name").asText()).isEqualTo("m_FIXTURE");
        assertThat(r.fileName()).isEqualTo("_ETL_m_FIXTURE.json");
        assertThat(r.sizeBytes()).isPositive();
    }

    @Test
    void listsDdlsExcludingRecipeAndTranslations() {
        assertThat(service.ddls("CDM/m_FIXTURE")).containsOnlyKeys("TGT_FIXTURE");
    }

    @Test
    void missingRecipeIs404() {
        assertThatThrownBy(() -> service.recipe("CDM/m_FIXTURE/nope.json"))
            .isInstanceOf(io.pure360.etl360.service.support.NotFoundException.class);
    }
}
```

- [x] **Step 2: Run to verify failure** — Run: `mvn -q -am -pl backend test -Dtest=RecipeServiceTest` — Expected: compile error.

- [x] **Step 3: Implement** — `RecipeService` reads via Jackson `ObjectMapper.readTree`; controllers are thin pass-throughs mirroring `MappingController`'s `{*path}` + `stripLeadingSlash` pattern (copy that static). Malformed JSON in a recipe file: catch `JsonProcessingException` and throw a new `UnreadableFileException` (`service.support`, message-only constructor like the others) with a matching `ApiExceptionHandler` case → 422, title "File unreadable". Controller test asserts shapes over the real corpus: `GET /api/recipes/CDM/m_DM_INFOHUB_BIZLINK/_ETL_m_DM_INFOHUB_BIZLINK.json` → 200 with `$.content` object; `GET /api/ddl/CDM/m_DM_INFOHUB_BIZLINK` → 200 map; missing → 404.

- [x] **Step 4: Run all backend tests** — Run: `mvn -q -am -pl backend test` — Expected: PASS.

- [x] **Step 5: Commit** — `git add -A && git commit -m "feat(backend): recipe and DDL endpoints"`

---

### Task 7: Expressions archive — `/api/expressions`

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/api/dto/ExpressionEntryDto.java`
- Create: `backend/src/main/java/io/pure360/etl360/service/ExpressionService.java`
- Create: `backend/src/main/java/io/pure360/etl360/api/ExpressionController.java`
- Test: `backend/src/test/java/io/pure360/etl360/service/ExpressionServiceTest.java`

**Interfaces:**
- Consumes: `CorpusService.allXmlPaths()`, `DomService.dom(path)`.
- Produces: `record ExpressionEntryDto(String mappingPath, String layer, String transformation, String port, String formula, String origin)`; `ExpressionService.all(): List<ExpressionEntryDto>` — walks every mapping's DOM; for each element named `TRANSFORMATION` (any depth), takes `@NAME`; for each child element `TRANSFORMFIELD` whose `EXPRESSION` attribute is non-blank **and differs from its `NAME` attribute** (identity expressions are pass-through noise), emits an entry with `origin = "xml"`, `layer` = first segment of mappingPath. Result cached per corpus scan (invalidated when any contributing file's mtime changes — reuse DomService's per-file cache and just rebuild the aggregate on each call; the DOM cache makes rebuilds cheap). `GET /api/expressions`.

- [x] **Step 1: Write the failing test** — fixture corpus: exactly one entry, `transformation == "EXP_FIX"`, `port == "COL_A_OUT"`, formula contains `LTRIM`, `origin == "xml"`, `layer == "CDM"`.

```java
package io.pure360.etl360.service;

import io.pure360.etl360.service.support.PathResolver;
import org.junit.jupiter.api.Test;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.assertThat;

class ExpressionServiceTest {
    @Test
    void extractsExpressionsFromXmlDom() {
        Path fixture = Path.of("src/test/resources/fixture-corpus");
        var service = new ExpressionService(new CorpusService(fixture),
                                            new DomService(new PathResolver(fixture)));
        var all = service.all();
        assertThat(all).hasSize(1);
        var e = all.get(0);
        assertThat(e.transformation()).isEqualTo("EXP_FIX");
        assertThat(e.port()).isEqualTo("COL_A_OUT");
        assertThat(e.formula()).contains("LTRIM");
        assertThat(e.origin()).isEqualTo("xml");
        assertThat(e.layer()).isEqualTo("CDM");
    }
}
```

- [x] **Step 2: Run to verify failure** — Run: `mvn -q -am -pl backend test -Dtest=ExpressionServiceTest` — Expected: compile error.

- [x] **Step 3: Implement** — recursive walk over `XmlNodeDto`; controller is a thin `@GetMapping("/api/expressions")`. Skip mappings whose DOM throws `XmlUnparsableException` (log warn, continue — one damaged file must not empty the archive).

- [x] **Step 4: Run + spot-check** — `mvn -q -am -pl backend test`; then boot and `curl -s localhost:8080/api/expressions | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d))"` — Expected: PASS; hundreds of entries from the real corpus.

- [x] **Step 5: Commit** — `git add -A && git commit -m "feat(backend): cross-corpus expressions archive from XML DOM"`

---

### Task 8: DataRoots fallback + `/api/config` + `.env.example`

**Files:**
- Create: `backend/src/main/java/io/pure360/etl360/config/DataRoots.java`
- Create: `backend/src/main/java/io/pure360/etl360/api/dto/AppConfigDto.java`
- Create: `backend/src/main/java/io/pure360/etl360/api/ConfigController.java`
- Create: `backend/src/main/resources/mock/DWH_CONTROL/README.md`
- Create: `.env.example`
- Test: `backend/src/test/java/io/pure360/etl360/config/DataRootsTest.java`
- Test: `backend/src/test/java/io/pure360/etl360/api/ConfigControllerTest.java`

**Interfaces:**
- Consumes: `Etl360Properties`.
- Produces: `DataRoots` bean — `Path corpus()`; `Optional<Path> dwhControl()` (real dir if exists, else mock-mirror subdir `DWH_CONTROL` if exists, else empty); `String dwhControlMode()` ∈ `"real" | "mock" | "absent"`; `Optional<Path> composer()`, `String composerMode()` (same real/absent logic, no mock tier). `record AppConfigDto(String projectId, String region, String dataprocJobUrl, String dataprocClusterUrl, String loggingUrl, String dwhControlMode, String composerMode, String corpusRoot)`. `GET /api/config`.

- [x] **Step 1: Write the failing DataRoots test** — three cases with `@TempDir`-built property objects (construct `Etl360Properties` directly with absolute temp paths): real dir present → mode `"real"`; only mock mirror (containing `DWH_CONTROL/`) → `"mock"`; neither → `"absent"` + empty Optional.

```java
package io.pure360.etl360.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import static org.assertj.core.api.Assertions.assertThat;

class DataRootsTest {
    private Etl360Properties props(Path corpus, Path dwh, Path mock) {
        return new Etl360Properties(corpus.toString(), dwh.toString(), mock.toString(),
            corpus.resolve("composer").toString(),
            new Etl360Properties.Gcp("p", "r", "u1", "u2", "u3"));
    }

    @Test
    void prefersRealDwhControl(@TempDir Path tmp) throws Exception {
        Path real = Files.createDirectories(tmp.resolve("DWH_CONTROL"));
        var roots = new DataRoots(props(tmp, real, tmp.resolve("mock")));
        assertThat(roots.dwhControlMode()).isEqualTo("real");
        assertThat(roots.dwhControl()).contains(real);
    }

    @Test
    void fallsBackToMockMirror(@TempDir Path tmp) throws Exception {
        Path mock = Files.createDirectories(tmp.resolve("mock/DWH_CONTROL"));
        var roots = new DataRoots(props(tmp, tmp.resolve("missing"), tmp.resolve("mock")));
        assertThat(roots.dwhControlMode()).isEqualTo("mock");
        assertThat(roots.dwhControl()).contains(mock);
    }

    @Test
    void absentWhenNeitherExists(@TempDir Path tmp) {
        var roots = new DataRoots(props(tmp, tmp.resolve("m1"), tmp.resolve("m2")));
        assertThat(roots.dwhControlMode()).isEqualTo("absent");
        assertThat(roots.dwhControl()).isEmpty();
    }
}
```

- [x] **Step 2: Run to verify failure** — Run: `mvn -q -am -pl backend test -Dtest=DataRootsTest` — Expected: compile error.

- [x] **Step 3: Implement** — `DataRoots` as `@Component`; `ConfigController` maps properties + modes into `AppConfigDto`. `mock/DWH_CONTROL/README.md` explains the mirror layout (`LAYER_TO_LAYER/<LAYER>/statements.sql`, populated by sub-project 4). `.env.example` lists every `ETL360_*` variable with the default and one commented corp-style example. Slice-test `/api/config` in a new `ConfigControllerTest` (200, `$.dwhControlMode` present, no unexpected secret-ish fields).

- [x] **Step 4: Run all backend tests** — `mvn -q -am -pl backend test` — Expected: PASS.

- [x] **Step 5: Commit** — `git add -A && git commit -m "feat(backend): data-root fallback (real/mock/absent) and /api/config"`

---

### Task 9: Corpus contract test (the automated smoke check)

**Files:**
- Test: `backend/src/test/java/io/pure360/etl360/CorpusContractTest.java`

**Interfaces:**
- Consumes: every endpoint from Tasks 3–8, `CorpusService.allXmlPaths()/allRecipePaths()`.

- [x] **Step 1: Write the test** (it should pass immediately — it's the integration gate, not TDD red/green)

```java
package io.pure360.etl360;

import io.pure360.etl360.service.CorpusService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class CorpusContractTest {
    @Autowired MockMvc mvc;
    @Autowired CorpusService corpus;

    @Test
    void everyMappingServesDomAndModel() throws Exception {
        List<String> mappings = corpus.allXmlPaths();
        assertThat(mappings).hasSizeGreaterThanOrEqualTo(46);
        for (String m : mappings) {
            mvc.perform(get("/api/mappings/dom/" + m)).andExpect(status().isOk());
            mvc.perform(get("/api/mappings/model/" + m)).andExpect(status().isOk());
        }
    }

    @Test
    void everyRecipeServes() throws Exception {
        List<String> recipes = corpus.allRecipePaths();
        assertThat(recipes).hasSizeGreaterThanOrEqualTo(64);
        for (String r : recipes) {
            mvc.perform(get("/api/recipes/" + r)).andExpect(status().isOk());
        }
    }
}
```
(≥ not ==, so sub-project 4's synthetic additions don't break it. Current values: 46 XMLs / 64 recipes.)

- [x] **Step 2: Run** — `mvn -q -am -pl backend test -Dtest=CorpusContractTest`
Expected: PASS 46/46 + 64/64. Any failure is a real fidelity bug — fix the service, never skip the file.

- [x] **Step 3: Commit** — `git add -A && git commit -m "test(backend): corpus contract — every XML serves dom+model, every recipe serves"`

---

### Task 10: Frontend test infra + API client

**Files:**
- Modify: `frontend/package.json` (deps + scripts), `frontend/vite.config.ts` (proxy + vitest)
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/src/api/client.ts`
- Test: `frontend/src/api/client.test.ts`

**Interfaces:**
- Produces: `class ApiError extends Error { status: number; title: string; detail?: string }`; `apiGet<T>(path: string): Promise<T>` (prefixes `/api`, parses problem+json into ApiError). npm scripts: `test` (vitest run), `test:watch`, `generate:api`.

- [x] **Step 1: Install dev deps + wire config**

```bash
cd frontend
pnpm add @tanstack/react-query
pnpm add -D vitest jsdom @testing-library/react @testing-library/jest-dom msw openapi-typescript
```

`package.json` scripts — add: `"test": "vitest run"`, `"test:watch": "vitest"`, `"generate:api": "openapi-typescript http://localhost:8080/v3/api-docs -o src/api/types.gen.ts"`. Rename `"name"` to `"etl360-frontend"`.

`vite.config.ts` — add inside the config object:
```ts
server: {
  proxy: { '/api': 'http://localhost:8080' },
},
test: {
  environment: 'jsdom',
  setupFiles: './src/test/setup.ts',
},
```
(import type from `vitest/config`: change `defineConfig` import to `vitest/config`.)

`src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
```

- [x] **Step 2: Write the failing client test**

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { apiGet, ApiError } from './client'

const server = setupServer(
  http.get('/api/health', () => HttpResponse.json({ status: 'UP' })),
  http.get('/api/recipes/missing.json', () =>
    HttpResponse.json(
      { title: 'Not found', status: 404, detail: 'No recipe at missing.json' },
      { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
    )),
)
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('apiGet', () => {
  it('returns parsed JSON', async () => {
    await expect(apiGet<{ status: string }>('/health')).resolves.toEqual({ status: 'UP' })
  })

  it('throws ApiError with problem+json fields', async () => {
    const err = await apiGet('/recipes/missing.json').catch(e => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(404)
    expect(err.title).toBe('Not found')
    expect(err.detail).toContain('missing.json')
  })
})
```

- [x] **Step 3: Run to verify failure** — Run: `pnpm test` — Expected: FAIL, `./client` unresolved.

- [x] **Step 4: Implement `client.ts`**

```ts
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail?: string,
  ) {
    super(detail ?? title)
    this.name = 'ApiError'
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`)
  if (!res.ok) {
    let problem: { title?: string; detail?: string } = {}
    try { problem = await res.json() } catch { /* non-JSON error body */ }
    throw new ApiError(res.status, problem.title ?? res.statusText, problem.detail)
  }
  return res.json() as Promise<T>
}
```

- [x] **Step 5: Run tests** — Run: `pnpm test` — Expected: PASS (2).

- [x] **Step 6: Commit** — `git add -A && git commit -m "feat(frontend): vitest+msw test infra, typed API client with problem+json errors"`

---

### Task 11: OpenAPI-generated types + TanStack Query hooks

**Files:**
- Create: `frontend/src/api/types.gen.ts` (generated, committed)
- Create: `frontend/src/api/queries.ts`
- Modify: `frontend/src/main.tsx` (QueryClientProvider)
- Test: `frontend/src/api/queries.test.tsx`

**Interfaces:**
- Consumes: `apiGet`, backend `/v3/api-docs`.
- Produces: `types.gen.ts` (committed OpenAPI types; source of `TreeNode`, `XmlNode`, `MappingModel`, `RecipeFile`, `ExpressionEntry`, `AppConfig` aliases exported from `queries.ts`); hooks `useTree()`, `useMappingDom(path)`, `useMappingModel(path)`, `useRecipe(path)`, `useDdl(path)`, `useExpressions()`, `useAppConfig()` — each `useQuery({ queryKey: [name, ...args], queryFn })` with `staleTime: 30_000`.

- [ ] **Step 1: Generate types from the live backend**

```bash
( cd backend && mvn -q -am spring-boot:run ) &   # from repo root: mvn -q -am -pl backend spring-boot:run &
until curl -sf localhost:8080/v3/api-docs > /dev/null; do sleep 1; done
cd frontend && pnpm generate:api
kill %1
```
Expected: `src/api/types.gen.ts` created, non-empty, containing `TreeNodeDto`.

- [ ] **Step 2: Write `queries.ts`** (type aliases re-exported so app code never imports `types.gen.ts` directly)

```ts
import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client'
import type { components } from './types.gen'

export type TreeNode = components['schemas']['TreeNodeDto']
export type XmlNode = components['schemas']['XmlNodeDto']
export type MappingModel = components['schemas']['MappingModelDto']
export type RecipeFile = components['schemas']['RecipeDto']
export type ExpressionEntry = components['schemas']['ExpressionEntryDto']
export type AppConfig = components['schemas']['AppConfigDto']

const STALE_MS = 30_000

export const useTree = () =>
  useQuery({ queryKey: ['tree'], queryFn: () => apiGet<TreeNode>('/tree'), staleTime: STALE_MS })

export const useMappingDom = (path: string) =>
  useQuery({ queryKey: ['dom', path], queryFn: () => apiGet<XmlNode>(`/mappings/dom/${path}`), staleTime: STALE_MS })

export const useMappingModel = (path: string) =>
  useQuery({ queryKey: ['model', path], queryFn: () => apiGet<MappingModel>(`/mappings/model/${path}`), staleTime: STALE_MS })

export const useRecipe = (path: string) =>
  useQuery({ queryKey: ['recipe', path], queryFn: () => apiGet<RecipeFile>(`/recipes/${path}`), staleTime: STALE_MS })

export const useDdl = (path: string) =>
  useQuery({ queryKey: ['ddl', path], queryFn: () => apiGet<Record<string, unknown>>(`/ddl/${path}`), staleTime: STALE_MS })

export const useExpressions = () =>
  useQuery({ queryKey: ['expressions'], queryFn: () => apiGet<ExpressionEntry[]>('/expressions'), staleTime: STALE_MS })

export const useAppConfig = () =>
  useQuery({ queryKey: ['config'], queryFn: () => apiGet<AppConfig>('/config'), staleTime: Infinity })
```

Wrap the app in `main.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
const queryClient = new QueryClient()
// wrap: <QueryClientProvider client={queryClient}><App /></QueryClientProvider>
```

- [ ] **Step 3: Write the hook test** (MSW serves a mini tree; renderHook from RTL)

```tsx
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import React from 'react'
import { useTree } from './queries'

const server = setupServer(
  http.get('/api/tree', () => HttpResponse.json({
    name: 'xmltobq', path: '', kind: 'dir', layer: 'root',
    children: [{ name: 'CDM', path: 'CDM', kind: 'dir', layer: 'CDM', children: [] }],
  })),
)
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

describe('useTree', () => {
  it('loads the tree', async () => {
    const { result } = renderHook(() => useTree(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.children?.[0]?.layer).toBe('CDM')
  })
})
```

- [ ] **Step 4: Run tests + type-check** — Run: `pnpm test && npx tsc --noEmit` — Expected: PASS, clean.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(frontend): OpenAPI-generated types, TanStack Query hooks, provider"`

---

### Task 12: Real sidebar tree (visual-contract rewiring)

**Files:**
- Create: `frontend/src/api/filesystemAdapter.ts`
- Create: `frontend/src/components/shared/useFilesystem.tsx`
- Modify: `frontend/src/types.ts` (widen `FSDir.layer` to `string`)
- Modify: `frontend/src/components/shared/Sidebar.tsx` (LAYER_COLORS additions only)
- Modify: `frontend/src/components/tab1/ETLViewer.tsx:187`, `frontend/src/components/tab2/ETLModifier.tsx:377` (swap `filesystem={FILESYSTEM}`)
- Modify: `frontend/src/mockData.ts` (legacy header comment)
- Test: `frontend/src/api/filesystemAdapter.test.ts`

**Interfaces:**
- Consumes: `useTree()`, `TreeNode` from Task 11; existing `FSDir`/`FSFile` from `types.ts`.
- Produces: `toFilesystem(root: TreeNode): FSDir`; `useFilesystem(): { fs: FSDir | null, loading: boolean, error: ApiError | null }` — tabs render `fs ?? FILESYSTEM`-style fallback **only while loading**; on error they render the error state, never silently the mock.

- [ ] **Step 1: Write the failing adapter test**

```ts
import { describe, expect, it } from 'vitest'
import { toFilesystem } from './filesystemAdapter'
import type { TreeNode } from './queries'

const tree: TreeNode = {
  name: 'xmltobq', path: '', kind: 'dir', layer: 'root',
  children: [
    {
      name: 'CDM', path: 'CDM', kind: 'dir', layer: 'CDM',
      children: [
        { name: 'm_A.xml', path: 'CDM/m_A.xml', kind: 'xml', layer: 'CDM', mappingPath: 'CDM/m_A', hasRecipe: true },
        {
          name: 'm_A', path: 'CDM/m_A', kind: 'outputDir', layer: 'CDM',
          children: [{ name: '_ETL_m_A.json', path: 'CDM/m_A/_ETL_m_A.json', kind: 'json', layer: 'CDM' }],
        },
      ],
    },
  ],
}

describe('toFilesystem', () => {
  it('maps dirs, xml and json files onto the Figma FSDir/FSFile shape', () => {
    const fs = toFilesystem(tree)
    expect(fs.name).toBe('xmltobq')
    expect(fs.layer).toBe('root')
    const cdm = fs.children[0] as { name: string; layer: string; children: unknown[] }
    expect(cdm.layer).toBe('CDM')
    expect(cdm.children).toEqual([
      { name: 'm_A.xml', path: 'CDM/m_A.xml', type: 'xml', mapping: 'CDM/m_A' },
      {
        name: 'm_A', layer: 'CDM',
        children: [{ name: '_ETL_m_A.json', path: 'CDM/m_A/_ETL_m_A.json', type: 'json', mapping: undefined }],
      },
    ])
  })
})
```

- [ ] **Step 2: Run to verify failure** — Run: `pnpm test` — Expected: FAIL, module missing.

- [ ] **Step 3: Implement**

`filesystemAdapter.ts`:
```ts
import type { FSDir, FSFile } from '../types'
import type { TreeNode } from './queries'

export function toFilesystem(node: TreeNode): FSDir {
  return {
    name: node.name ?? '',
    layer: (node.layer ?? undefined) as FSDir['layer'],
    children: (node.children ?? []).map(child =>
      child.kind === 'dir' || child.kind === 'outputDir'
        ? toFilesystem(child)
        : toFile(child),
    ),
  }
}

function toFile(node: TreeNode): FSFile {
  return {
    name: node.name ?? '',
    path: node.path ?? '',
    type: node.kind === 'xml' ? 'xml' : 'json',
    mapping: node.mappingPath ?? undefined,
  }
}
```

`types.ts`: change `layer?: 'CDM' | 'ODS' | 'SRC' | 'TGT' | 'root'` → `layer?: string`.

`Sidebar.tsx` LAYER_COLORS — add real corpus layers using existing `:root` tokens only (visual-contract-compatible data completeness, not a restyle):
```ts
DWH: '#fbbf24',  // --yellow
ETL: '#fb923c',  // --orange
QDM: '#f472b6',  // --pink
RDM: '#67e8f9',  // --cyan
STG: '#22d3ee',  // --teal
```

`useFilesystem.tsx` — wraps `useTree` + `toFilesystem` (memoized), returns `{ fs, loading, error }`.

In `ETLViewer.tsx` and `ETLModifier.tsx`: call the hook, pass `filesystem={fs ?? EMPTY_FS}` where `const EMPTY_FS = { name: 'xmltobq', layer: 'root', children: [] }`; while `loading` show the existing dim-text style (`color: var(--text-dim)`, 12px, padding 12) with "Loading corpus…" inside the sidebar `extraContent` slot; on `error` show `error.title` + `error.detail` in `--red` at the same spot. Remove the `FILESYSTEM` import from both tabs (other mock imports stay).

`mockData.ts` header comment:
```ts
// LEGACY FIGMA MOCK DATA — being retired tab-by-tab per docs/superpowers/specs/2026-07-29-etl360-foundation-design.md.
// The filesystem tree is REAL now (src/api/filesystemAdapter.ts); tabs below still consume mocks until their sub-project lands.
```

- [ ] **Step 4: Run tests + type-check** — Run: `pnpm test && npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 5: Visual verification against the contract** — run backend + `pnpm dev`, open the app: sidebar shows real layers (CDM, DWH, ETL, ODS, …) with badges/colors/indent identical in style to the prototype; search filters; Viewer/Modifier tabs otherwise unchanged (still mock canvases). Compare side-by-side with a `git stash`-free checkout of `main` if in doubt.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(frontend): real corpus tree in sidebar via adapter — Figma look unchanged"`

---

### Task 13: Dev harness — Makefile + scripts + README

**Files:**
- Create: `Makefile`
- Create: `scripts/dev.sh`
- Create: `scripts/regen_corpus.sh`
- Create: `README.md` (root)

**Interfaces:**
- Consumes: everything runnable so far.
- Produces: `make dev|test|test-backend|test-frontend|check|build|regen-corpus|generate-api`.

- [ ] **Step 1: Write the Makefile**

```makefile
.PHONY: dev test test-backend test-frontend check build regen-corpus generate-api

dev:            ## run backend + frontend together (Ctrl-C stops both)
	bash scripts/dev.sh

test: test-backend test-frontend

test-backend:
	mvn -q -am -pl backend test

test-frontend:
	cd frontend && pnpm test

check: test
	cd frontend && npx tsc --noEmit && pnpm format --check || true
	@echo "check done"

build:
	mvn -q package
	cd frontend && pnpm build

regen-corpus:   ## regenerate recipes over a TEMP COPY and diff vs committed corpus
	bash scripts/regen_corpus.sh

generate-api:   ## refresh frontend/src/api/types.gen.ts from a running backend
	cd frontend && pnpm generate:api
```
(`pnpm format --check`: oxfmt supports `--check`; if the local version doesn't, drop that clause and record it in the README. The `|| true` guards the first run; remove it once format is clean.)

- [ ] **Step 2: Write `scripts/dev.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
trap 'kill 0 2>/dev/null' INT TERM EXIT
( mvn -q -am -pl backend spring-boot:run 2>&1 | sed -u 's/^/[backend]  /' ) &
( cd frontend && pnpm dev 2>&1 | sed -u 's/^/[frontend] /' ) &
wait
```

- [ ] **Step 3: Write `scripts/regen_corpus.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
CORPUS=parser/src/main/resources/xmltobq
TMP=$(mktemp -d)
rsync -a --include='*/' --include='*.xml' --exclude='*' "$CORPUS/" "$TMP/xmltobq/"
mvn -q -pl parser compile exec:java -Dexec.args="--xmlPath $TMP/xmltobq --generateDDLContent --generateRecipe --generateTargetDDL --generateSourceDDL"
echo "--- diff vs committed corpus (anonymized-key diffs in recipes are EXPECTED, see CLAUDE.md) ---"
diff -r "$CORPUS" "$TMP/xmltobq" || true
echo "--- regenerated into $TMP/xmltobq (left in place for inspection) ---"
```

`chmod +x scripts/*.sh`.

- [ ] **Step 4: Write root README.md** — sections: what the suite is (2 paragraphs), prerequisites (JDK 17, Maven 3.9+, Node 20+, pnpm), quick start (`make dev` → http://localhost:5173), the make-target table, configuration (`.env.example`, `ETL360_*` vars, real-vs-mock data modes), repo layout tree, links to `docs/architecture.md`, ADRs, specs/plans, and the corpus caveats pointer to CLAUDE.md.

- [ ] **Step 5: Verify the harness end-to-end** — Run: `make test`, then `make dev` (confirm both prefixes stream, app loads, Ctrl-C kills both), then `make regen-corpus` (diff report prints).
Expected: all green / behave as described.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "chore: dev harness — Makefile, dev/regen scripts, root README"`

---

### Task 14: Docs restructure — CLAUDE.md, ADRs, architecture.md, frontend docs

**Files:**
- Modify: `CLAUDE.md` (full rewrite)
- Create: `docs/adr/0000-template.md`, `docs/adr/0001-multi-module-spring-boot-backend.md`, `docs/adr/0002-dom-plus-semantic-overlay.md`, `docs/adr/0003-mock-mirror-fallback.md`, `docs/adr/0004-openapi-generated-frontend-types.md`, `docs/adr/0005-figma-visual-contract.md`
- Create: `docs/architecture.md`
- Modify: `frontend/AGENTS.md` (rewrite), `frontend/CLAUDE.md` (keep as `@AGENTS.md` include)
- Modify: `docs/superpowers/specs/2026-07-29-etl360-foundation-design.md` (two deviation footnotes)

- [ ] **Step 1: Rewrite root CLAUDE.md** — keep every still-true rule from the current file (corpus caveats verbatim, SQL-derived-artifacts rule, DWH_CONTROL rule), update all paths to `parser/…`, and add: repo layout table (parser/backend/frontend/docs), build & run matrix (`make dev`, per-module commands), the API endpoint table from `docs/architecture.md` by reference, hard rules incl. **Figma visual contract** and **plans/specs live in docs/superpowers/ and progress is tracked by checkboxes committed with each task**, testing commands (`make test`, corpus contract test explanation), and pointers to ADRs. Target ≤ 120 lines — it's an index, not a manual.

- [ ] **Step 2: Write the ADRs** — MADR-lite template (`Status / Context / Decision / Consequences / Alternatives considered`), each ADR ≤ 30 lines, content = the corresponding "Decisions already made" bullet of spec §3 expanded with the rejected options and one-line rationales. ADR-0002 additionally records: mixed-content ordering not preserved in DOM JSON (Powermart has none), semantic DTOs mirror parser case classes field-for-field. ADR-0003 additionally records: composer CSVs have no mock tier in Foundation (mode `real|absent`).

- [ ] **Step 3: Write docs/architecture.md** — copy the mermaid diagram from spec §3 (updating the mock-mirror node label to the final path), the final endpoint table (with the `dom/{*path}` segment-order deviation noted), the config reference (`application.yml` keys + `ETL360_*` envs), and a request-flow mermaid sequence diagram (browser → Vite proxy → controller → service → filesystem/parser → cache).

- [ ] **Step 4: Rewrite frontend/AGENTS.md** — React 19 + Vite + Tailwind v4; run via `make dev` (or `pnpm dev` + backend separately); test via `pnpm test`; **visual contract paragraph** (tokens in `src/index.css`, never restyle while rewiring; `mockData.ts` is legacy being retired tab-by-tab); API layer pointer (`src/api/`, regenerate types with `make generate-api`). Keep `frontend/CLAUDE.md` as the one-line `@AGENTS.md` include it already is.

- [ ] **Step 5: Add spec footnotes** — in spec §4: (a) endpoint segment order changed to `/api/mappings/dom/{*path}` (Spring `{*var}` must be trailing); (b) `/api/expressions` ships `origin:"xml"` only in Foundation (anonymized recipe keys make recipe-side extraction unreliable; revisit in sub-project 3); and in spec §7: (c) parser regression realized as the one-time pre/post-move byte-diff (Task 1) plus the ongoing corpus contract test — not a permanent JUnit regen harness. Mark all three as "Implementation deviations".

- [ ] **Step 5b: Project skills (spec §9)** — create `.claude/skills/run-app/SKILL.md` ("how to run/verify the suite: `make dev`, ports, health-check curl, where logs go") and `.claude/skills/regen-corpus/SKILL.md` ("safe regeneration: always `make regen-corpus`, never in-place; how to read the diff given anonymized-key noise"). Each ≤ 25 lines, frontmatter `name` + `description`, body = thin wrapper over the Makefile target it fronts.

- [ ] **Step 6: Verify docs match reality** — every command quoted in CLAUDE.md/README/architecture.md actually runs; every path exists (`grep -o` spot checks). Run `make check` one more time.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "docs: CLAUDE.md rewrite, ADRs 0000-0005, architecture.md, frontend agent docs"`

---

### Task 15: Acceptance sweep (spec §11)

**Files:** none new — verification + fixes only.

- [ ] **Step 1: Walk the acceptance criteria** — for each of the 7 criteria in spec §11, run the check and record PASS/FAIL in the task commit message:
1. `make dev` boots both; GUI visually identical to prototype.
2. Sidebar = real tree, search works, prototype behavior.
3. All 8 endpoints curl-clean; corpus contract test green (46/46 dom+model, 64/64 recipes).
4. Task 1's regeneration diff was IDENTICAL (cite the Task 1 commit).
5. `make check` green.
6. CLAUDE.md/README/ADRs×5/architecture.md exist and match reality; frontend/AGENTS.md rewritten.
7. Side-by-side vs `main`: all four tabs + top bar render identically (tabs still mock-fed).

- [ ] **Step 2: Fix anything red, re-run, then commit** — `git commit -m "chore: Foundation acceptance sweep — spec §11 criteria verified" --allow-empty` (allow-empty when no fixes were needed; the message carries the PASS record).

- [ ] **Step 3: Close out** — tick the last checkboxes here, commit this plan file, and use superpowers:finishing-a-development-branch to decide merge/PR for `feat/etl360-foundation`.
