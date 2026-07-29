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
