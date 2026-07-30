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

    @Test
    void prefersRealComposer(@TempDir Path tmp) throws Exception {
        Path real = Files.createDirectories(tmp.resolve("composer"));
        var roots = new DataRoots(props(tmp, tmp.resolve("dwh"), tmp.resolve("mock")));
        assertThat(roots.composerMode()).isEqualTo("real");
        assertThat(roots.composer()).contains(real);
    }

    @Test
    void fallsBackToMockComposer(@TempDir Path tmp) throws Exception {
        Path mock = Files.createDirectories(tmp.resolve("mock/composer"));
        var roots = new DataRoots(props(tmp, tmp.resolve("dwh"), tmp.resolve("mock")));
        assertThat(roots.composerMode()).isEqualTo("mock");
        assertThat(roots.composer()).contains(mock);
    }

    @Test
    void absentWhenComposerNeitherExists(@TempDir Path tmp) {
        var roots = new DataRoots(props(tmp, tmp.resolve("dwh"), tmp.resolve("mock")));
        assertThat(roots.composerMode()).isEqualTo("absent");
        assertThat(roots.composer()).isEmpty();
    }
}
