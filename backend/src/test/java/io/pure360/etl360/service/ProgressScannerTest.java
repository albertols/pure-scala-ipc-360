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
