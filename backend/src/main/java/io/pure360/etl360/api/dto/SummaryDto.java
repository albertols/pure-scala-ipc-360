package io.pure360.etl360.api.dto;

import java.util.List;

/**
 * {@code GET /api/summary} body: static corpus counts for the view-aware summary chip each
 * tab's left rail (or, for Tab 3, floating bottom-left chip) renders — see
 * {@link io.pure360.etl360.service.CorpusService#summary()}. Same {@code _history}/
 * {@code _layout_} exclusions as every other corpus walk. {@code layers} is the sorted,
 * deduplicated set of top-level directory names (e.g. {@code CDM}, {@code DWH}) the corpus's
 * XML/recipe/DDL entries live under.
 */
public record SummaryDto(int xmlCount, int recipeCount, int ddlCount, int dirCount, List<String> layers) {}
