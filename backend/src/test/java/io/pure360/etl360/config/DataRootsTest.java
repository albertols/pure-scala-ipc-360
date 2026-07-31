package io.pure360.etl360.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * A data root counts as "real" only when it carries the structure its reader needs —
 * {@code LAYER_TO_LAYER/} for DWH_CONTROL, the {@code dwh/config/cluster_tuning/inputs}
 * chain for composer. Mere directory existence is not usability.
 */
class DataRootsTest {
    private Etl360Properties props(Path corpus, Path dwh, Path mock) {
        return new Etl360Properties(corpus.toString(), dwh.toString(), mock.toString(),
            corpus.resolve("composer").toString(),
            new Etl360Properties.Gcp("p", "r", "u1", "u2", "u3"));
    }

    /** A DWH_CONTROL root is only usable with LAYER_TO_LAYER/ inside it. */
    private Path usableDwh(Path root) throws Exception {
        Files.createDirectories(root.resolve(DataRoots.LAYER_TO_LAYER));
        return root;
    }

    /** A composer root is only usable with the inputs chain inside it. */
    private Path usableComposer(Path root) throws Exception {
        Files.createDirectories(root.resolve(DataRoots.COMPOSER_INPUTS));
        return root;
    }

    @Test
    void prefersRealDwhControl(@TempDir Path tmp) throws Exception {
        Path real = usableDwh(tmp.resolve("DWH_CONTROL"));
        usableDwh(tmp.resolve("mock/DWH_CONTROL"));
        var roots = new DataRoots(props(tmp, real, tmp.resolve("mock")));
        assertThat(roots.dwhControlMode()).isEqualTo("real");
        assertThat(roots.dwhControl()).contains(real);
    }

    @Test
    void fallsBackToMockMirror(@TempDir Path tmp) throws Exception {
        Path mock = usableDwh(tmp.resolve("mock/DWH_CONTROL"));
        var roots = new DataRoots(props(tmp, tmp.resolve("missing"), tmp.resolve("mock")));
        assertThat(roots.dwhControlMode()).isEqualTo("mock");
        assertThat(roots.dwhControl()).contains(mock);
    }

    /**
     * Regression (reported from a real machine): a legacy DWH_CONTROL holding only old-style
     * export folders — no LAYER_TO_LAYER/ — used to win the real tier purely by existing, so
     * the relationships graph came back EMPTY and Tab 3 showed "No relationship entries"
     * while a complete mock mirror sat unused right next to it.
     */
    @Test
    void legacyDwhControlWithoutLayerToLayerFallsThroughToMock(@TempDir Path tmp) throws Exception {
        Path legacy = tmp.resolve("DWH_CONTROL");
        Files.createDirectories(legacy.resolve("2.1.STG_TO_ODS"));
        Files.createDirectories(legacy.resolve("6.DWH_TO_OUTPUT"));
        Path mock = usableDwh(tmp.resolve("mock/DWH_CONTROL"));

        var roots = new DataRoots(props(tmp, legacy, tmp.resolve("mock")));

        assertThat(roots.dwhControlMode()).isEqualTo("mock");
        assertThat(roots.dwhControl()).contains(mock);
    }

    @Test
    void absentWhenNeitherExists(@TempDir Path tmp) {
        var roots = new DataRoots(props(tmp, tmp.resolve("m1"), tmp.resolve("m2")));
        assertThat(roots.dwhControlMode()).isEqualTo("absent");
        assertThat(roots.dwhControl()).isEmpty();
    }

    /** A legacy real dir AND an unusable mock ⇒ absent, not a false "real". */
    @Test
    void absentWhenBothPresentButUnusable(@TempDir Path tmp) throws Exception {
        Path legacy = tmp.resolve("DWH_CONTROL");
        Files.createDirectories(legacy.resolve("2.1.STG_TO_ODS"));
        Files.createDirectories(tmp.resolve("mock/DWH_CONTROL"));

        var roots = new DataRoots(props(tmp, legacy, tmp.resolve("mock")));

        assertThat(roots.dwhControlMode()).isEqualTo("absent");
        assertThat(roots.dwhControl()).isEmpty();
    }

    @Test
    void prefersRealComposer(@TempDir Path tmp) throws Exception {
        Path real = usableComposer(tmp.resolve("composer"));
        usableComposer(tmp.resolve("mock/composer"));
        var roots = new DataRoots(props(tmp, tmp.resolve("dwh"), tmp.resolve("mock")));
        assertThat(roots.composerMode()).isEqualTo("real");
        assertThat(roots.composer()).contains(real);
    }

    @Test
    void fallsBackToMockComposer(@TempDir Path tmp) throws Exception {
        Path mock = usableComposer(tmp.resolve("mock/composer"));
        var roots = new DataRoots(props(tmp, tmp.resolve("dwh"), tmp.resolve("mock")));
        assertThat(roots.composerMode()).isEqualTo("mock");
        assertThat(roots.composer()).contains(mock);
    }

    /** A composer dir without the inputs chain is not a usable real tier. */
    @Test
    void composerWithoutInputsChainFallsThroughToMock(@TempDir Path tmp) throws Exception {
        Files.createDirectories(tmp.resolve("composer/unrelated"));
        Path mock = usableComposer(tmp.resolve("mock/composer"));
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
