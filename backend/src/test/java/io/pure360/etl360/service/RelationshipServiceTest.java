package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.RelationshipsDto;
import io.pure360.etl360.config.DataRoots;
import io.pure360.etl360.config.Etl360Properties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

class RelationshipServiceTest {
    private RelationshipService service() {
        Path mockRoot = Path.of("src/test/resources/fixture-mock").toAbsolutePath();
        Path corpusRoot = Path.of("src/test/resources/fixture-corpus").toAbsolutePath();
        var props = new Etl360Properties("unused", mockRoot.resolve("DWH_CONTROL").toString(),
            mockRoot.toString(), "unused-composer",
            new Etl360Properties.Gcp("p", "r", "u1", "u2", "u3"));
        LayerToLayerService l2l = new LayerToLayerService(new DataRoots(props), props);
        CorpusService corpus = new CorpusService(corpusRoot);
        return new RelationshipService(l2l, corpus);
    }

    @Test
    void metaReflectsEntryAndSkippedCountsAndDistinctSortedLayers() {
        RelationshipsDto graph = service().graph();
        assertThat(graph.meta().entryCount()).isEqualTo(3);
        assertThat(graph.meta().skippedRows()).isEqualTo(1);
        assertThat(graph.meta().layers()).containsExactly("ODS");
    }

    @Test
    void everyEdgeEndpointExistsAsANode() {
        RelationshipsDto graph = service().graph();
        List<String> nodeIds = graph.nodes().stream().map(RelationshipsDto.NodeDto::id).toList();
        for (RelationshipsDto.EdgeDto edge : graph.edges()) {
            assertThat(nodeIds).as("edge.from() must exist as a node").contains(edge.from());
            assertThat(nodeIds).as("edge.to() must exist as a node").contains(edge.to());
        }
    }

    @Test
    void recipeNodeMatchingFixtureCorpusRecipeHasRecipeTrueAndMappingPath() {
        RelationshipsDto graph = service().graph();
        RelationshipsDto.NodeDto fixtureRecipe = graph.nodes().stream()
            .filter(n -> n.id().equals("recipe:_ETL_m_FIXTURE.json")).findFirst().orElseThrow();
        assertThat(fixtureRecipe.kind()).isEqualTo("recipe");
        assertThat(fixtureRecipe.hasRecipe()).isTrue();
        assertThat(fixtureRecipe.mappingPath()).isEqualTo("CDM/m_FIXTURE");
        assertThat(fixtureRecipe.layer()).isEqualTo("ODS");
        assertThat(fixtureRecipe.workflow()).isEqualTo("wf_FIXTURE_LOAD");
        assertThat(fixtureRecipe.executionOrder()).isEqualTo(3);
    }

    @Test
    void recipeNodeWithNoMatchingCorpusRecipeHasRecipeFalseAndNullMappingPath() {
        RelationshipsDto graph = service().graph();
        RelationshipsDto.NodeDto fullRecipe = graph.nodes().stream()
            .filter(n -> n.id().equals("recipe:_ETL_m_FIX_ODS_FULL.json")).findFirst().orElseThrow();
        assertThat(fullRecipe.hasRecipe()).isFalse();
        assertThat(fullRecipe.mappingPath()).isNull();
    }

    @Test
    void writeModeAndPartitionTypeLandOnTheTargetTableNode() {
        RelationshipsDto graph = service().graph();
        RelationshipsDto.NodeDto fullTarget = graph.nodes().stream()
            .filter(n -> n.id().equals("table:ODS_FIX_FULL_TARGET")).findFirst().orElseThrow();
        assertThat(fullTarget.kind()).isEqualTo("table");
        assertThat(fullTarget.writeMode()).isEqualTo("APPEND");
        assertThat(fullTarget.partitionType()).isEqualTo("DAILY");

        // ODS_FIX_FULL_AUX is only referenced inside targets_write_mode, never as an
        // actual entry.target() — it must never get its own node.
        assertThat(graph.nodes()).extracting(RelationshipsDto.NodeDto::id)
            .doesNotContain("table:ODS_FIX_FULL_AUX");
    }

    @Test
    void sourceAndLookupTableNodesAndEdgesAreBuiltPerEntry() {
        RelationshipsDto graph = service().graph();
        List<String> nodeIds = graph.nodes().stream().map(RelationshipsDto.NodeDto::id).toList();
        assertThat(nodeIds).contains(
            "table:SRC_TABLE_A, WITH_COMMA", "table:SRC_TABLE_B",
            "table:LKP_ONE", "table:LKP_TWO",
            "table:SRC_FIXTURE", "table:LKP_FIXTURE");

        assertThat(graph.edges()).contains(
            new RelationshipsDto.EdgeDto("table:SRC_TABLE_A, WITH_COMMA", "recipe:_ETL_m_FIX_ODS_FULL.json", "source"),
            new RelationshipsDto.EdgeDto("table:SRC_TABLE_B", "recipe:_ETL_m_FIX_ODS_FULL.json", "source"),
            new RelationshipsDto.EdgeDto("table:LKP_ONE", "recipe:_ETL_m_FIX_ODS_FULL.json", "lookup"),
            new RelationshipsDto.EdgeDto("table:LKP_TWO", "recipe:_ETL_m_FIX_ODS_FULL.json", "lookup"),
            new RelationshipsDto.EdgeDto("recipe:_ETL_m_FIX_ODS_FULL.json", "table:ODS_FIX_FULL_TARGET", "writes"),
            new RelationshipsDto.EdgeDto("table:SRC_FIXTURE", "recipe:_ETL_m_FIXTURE.json", "source"),
            new RelationshipsDto.EdgeDto("table:LKP_FIXTURE", "recipe:_ETL_m_FIXTURE.json", "lookup"),
            new RelationshipsDto.EdgeDto("recipe:_ETL_m_FIXTURE.json", "table:TGT_FIXTURE", "writes"),
            new RelationshipsDto.EdgeDto("recipe:_ETL_m_FIX_ODS_EMPTY.json", "table:ODS_FIX_EMPTY_TARGET", "writes"));
    }

    @Test
    void nodeAndEdgeCountsMatchTheThreeEntryFixture() {
        RelationshipsDto graph = service().graph();
        // 3 recipe nodes + 3 target-table nodes + 3 source-table nodes + 3 lookup-table nodes
        assertThat(graph.nodes()).hasSize(12);
        // 3 writes + 3 source (2 from FULL, 1 from FIXTURE) + 3 lookup (2 from FULL, 1 from FIXTURE)
        assertThat(graph.edges()).hasSize(9);
    }

    @Test
    void dedupesNodesByIdFirstWriterWinsAndEdgesExactly(@TempDir Path tmp) throws Exception {
        Path dir = Files.createDirectories(tmp.resolve("DWH_CONTROL/LAYER_TO_LAYER/ODS"));
        // Row 1 appears twice verbatim (same recipe, same target) — must collapse to a single
        // recipe node and a single "writes" edge, not two. Row 2 targets the SAME physical table
        // ('SHARED') with a different write mode/partition — that table node must keep row 1's
        // metadata (first-writer-wins), while still getting its own separate "writes" edge from
        // recipe:r2.json (edges dedupe by exact from/to/kind triple, not by target alone).
        String row1 = "INSERT INTO CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES "
            + "('ODS', 'dir', 'r1.json', 'wf1', 'SHARED', 1, [], [], "
            + "[STRUCT('SHARED', 'APPEND')], [STRUCT('SHARED', 'DAILY', 'LOAD_DATE', 'NONE')])";
        String row2 = "INSERT INTO CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES "
            + "('ODS', 'dir', 'r2.json', 'wf2', 'SHARED', 2, [], [], "
            + "[STRUCT('SHARED', 'TRUNCATE_INSERT')], [STRUCT('SHARED', 'MONTHLY', 'LOAD_DATE', 'NONE')])";
        Files.writeString(dir.resolve("statements.sql"), row1 + "\n" + row1 + "\n" + row2 + "\n");

        var props = new Etl360Properties("unused", dir.getParent().getParent().toString(),
            tmp.resolve("unused-mock").toString(), "unused-composer",
            new Etl360Properties.Gcp("p", "r", "u1", "u2", "u3"));
        LayerToLayerService l2l = new LayerToLayerService(new DataRoots(props), props);
        CorpusService emptyCorpus = new CorpusService(Files.createDirectories(tmp.resolve("empty-corpus")));
        RelationshipService svc = new RelationshipService(l2l, emptyCorpus);

        assertThat(l2l.entries()).hasSize(3); // duplicate row1 parses as two distinct entries

        RelationshipsDto graph = svc.graph();
        assertThat(graph.nodes()).extracting(RelationshipsDto.NodeDto::id)
            .containsExactlyInAnyOrder("recipe:r1.json", "recipe:r2.json", "table:SHARED");

        RelationshipsDto.NodeDto shared = graph.nodes().stream()
            .filter(n -> n.id().equals("table:SHARED")).findFirst().orElseThrow();
        assertThat(shared.writeMode()).isEqualTo("APPEND");
        assertThat(shared.partitionType()).isEqualTo("DAILY");

        assertThat(graph.edges()).containsExactlyInAnyOrder(
            new RelationshipsDto.EdgeDto("recipe:r1.json", "table:SHARED", "writes"),
            new RelationshipsDto.EdgeDto("recipe:r2.json", "table:SHARED", "writes"));
    }

    @Test
    void writerMetadataAndLayerSurviveEntryOrderAcrossLayersAndMetaLayersSort(@TempDir Path tmp) throws Exception {
        // ODS is processed before DWH (LayerToLayerService.LAYER_DIRS order), so the ODS entry
        // below — which only SOURCES TABLE_X — creates the table:TABLE_X node first, with no
        // write-mode/partition info of its own. The DWH entry, processed after, is the one that
        // actually TARGETS TABLE_X with a write mode and partition. Before the fix, the node's
        // writeMode/partitionType (and layer) would stay whatever the ODS-sourcing branch set —
        // i.e. null/null and layer "ODS" — because dedup is first-writer-wins per id. The table's
        // metadata must instead reflect the actual writer (DWH) regardless of processing order.
        Path odsDir = Files.createDirectories(tmp.resolve("DWH_CONTROL/LAYER_TO_LAYER/ODS"));
        Path dwhDir = Files.createDirectories(tmp.resolve("DWH_CONTROL/LAYER_TO_LAYER/DWH"));
        Files.writeString(odsDir.resolve("statements.sql"),
            "INSERT INTO CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES "
                + "('ODS', 'dir', 'r_ods.json', 'wf_ods', 'ODS_OTHER_TARGET', 1, "
                + "[STRUCT('TABLE_X', true, 0)], [], [], [])");
        Files.writeString(dwhDir.resolve("statements.sql"),
            "INSERT INTO CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES "
                + "('DWH', 'dir', 'r_dwh.json', 'wf_dwh', 'TABLE_X', 2, [], [], "
                + "[STRUCT('TABLE_X', 'APPEND')], [STRUCT('TABLE_X', 'DAILY', 'LOAD_DATE', 'NONE')])");

        var props = new Etl360Properties("unused", tmp.resolve("DWH_CONTROL").toString(),
            tmp.resolve("unused-mock").toString(), "unused-composer",
            new Etl360Properties.Gcp("p", "r", "u1", "u2", "u3"));
        LayerToLayerService l2l = new LayerToLayerService(new DataRoots(props), props);
        CorpusService emptyCorpus = new CorpusService(Files.createDirectories(tmp.resolve("empty-corpus")));
        RelationshipService svc = new RelationshipService(l2l, emptyCorpus);

        assertThat(l2l.entries()).extracting(e -> e.layer()).containsExactly("ODS", "DWH"); // processing order

        RelationshipsDto graph = svc.graph();
        RelationshipsDto.NodeDto tableX = graph.nodes().stream()
            .filter(n -> n.id().equals("table:TABLE_X")).findFirst().orElseThrow();
        assertThat(tableX.layer()).isEqualTo("DWH");
        assertThat(tableX.writeMode()).isEqualTo("APPEND");
        assertThat(tableX.partitionType()).isEqualTo("DAILY");

        // Distinct layers come back sorted (DWH < ODS alphabetically), not in encounter order
        // (ODS was encountered first).
        assertThat(graph.meta().layers()).containsExactly("DWH", "ODS");
    }
}
