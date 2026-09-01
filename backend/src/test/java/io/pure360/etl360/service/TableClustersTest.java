package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.RelationshipsDto;
import io.pure360.etl360.service.support.TableClusters;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The recipe<->table adjacency join, which a table's cluster membership is derived from: b15
 * groups RECIPE runs, so a table has no cluster of its own and must inherit every one of the
 * recipes that write or read it.
 */
class TableClustersTest {

    private static RelationshipsDto.NodeDto node(String id, String kind, String name) {
        return new RelationshipsDto.NodeDto(id, kind, name, "DWH", null, null, null, null, null, null);
    }

    /** t_in -> r_a -> t_mid -> r_b -> t_out, plus a lookup from t_side into r_a. */
    private static final RelationshipsDto GRAPH = new RelationshipsDto(
        List.of(node("table:IN", "table", "IN"),
                node("recipe:A", "recipe", "_ETL_a.json"),
                node("table:MID", "table", "MID"),
                node("recipe:B", "recipe", "_ETL_b.json"),
                node("table:OUT", "table", "OUT"),
                node("table:SIDE", "table", "SIDE")),
        List.of(new RelationshipsDto.EdgeDto("table:IN", "recipe:A", "source"),
                new RelationshipsDto.EdgeDto("recipe:A", "table:MID", "writes"),
                new RelationshipsDto.EdgeDto("table:MID", "recipe:B", "source"),
                new RelationshipsDto.EdgeDto("recipe:B", "table:OUT", "writes"),
                new RelationshipsDto.EdgeDto("table:SIDE", "recipe:A", "lookup")),
        new RelationshipsDto.MetaDto(0, 0, List.of()));

    @Test
    void joinsATableToTheRecipesOnBOTHSidesOfIt() {
        TableClusters joins = TableClusters.of(GRAPH);
        // MID is written by A and read by B — an operator troubleshooting it wants both.
        assertThat(joins.recipeIdsFor("table:MID")).containsExactlyInAnyOrder("recipe:A", "recipe:B");
        assertThat(joins.recipeIdsFor("table:IN")).containsExactly("recipe:A");
        assertThat(joins.recipeIdsFor("table:SIDE")).containsExactly("recipe:A");
    }

    @Test
    void anUnknownTableJoinsToNothing() {
        assertThat(TableClusters.of(GRAPH).recipeIdsFor("table:NOPE")).isEmpty();
    }

    @Test
    void listsEveryTableThatHasAtLeastOneRecipe() {
        assertThat(TableClusters.of(GRAPH).tableIds())
            .containsExactlyInAnyOrder("table:IN", "table:MID", "table:OUT", "table:SIDE");
    }

    @Test
    void unionsTheAdjacentRecipesClustersNameAscending() {
        Map<String, List<String>> clustersByRecipe = Map.of(
            "_ETL_a.json", List.of("cl-z", "cl-a"),
            "_ETL_b.json", List.of("cl-m"));
        assertThat(TableClusters.of(GRAPH).clustersFor("table:MID", clustersByRecipe))
            .containsExactly("cl-a", "cl-m", "cl-z");
    }
}
