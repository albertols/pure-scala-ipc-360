package io.pure360.etl360.api.dto;

/** One column of one DDL definition: its name and the BigQuery type the {@code <TABLE>.json}
 * carries verbatim ({@code STRING}, {@code NUMERIC}, {@code INT64}, {@code TIMESTAMP},
 * {@code DATETIME} — the five the corpus actually uses). The type travels because the ETL
 * Modifier's node dialog authors a new target's fields from it (Task 16), and a recipe field
 * needs a {@code ScalaType} {@code dataType}; the mapping BigQuery -> ScalaType is the
 * frontend's (see {@code NodeConfigDialog.scalaTypeForDdlType}), so nothing here interprets
 * the token. */
public record RegistryColumnDto(String name, String type) {}
