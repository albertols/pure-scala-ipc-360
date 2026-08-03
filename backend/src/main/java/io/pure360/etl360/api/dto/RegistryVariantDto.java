package io.pure360.etl360.api.dto;

import java.util.List;

/**
 * One DISTINCT definition behind a registry DDL table name (Task 16): the columns one real
 * {@code <TABLE>.json} carries, plus every mapping directory whose copy of that file has the
 * same column set.
 *
 * <p>A variant is a column SET, not a file. 212 raw {@code <TABLE>.json} files collapse to 180
 * names; 25 of those names recur across mapping dirs but only 11 carry genuinely different
 * column sets — the other 14 are identical copies and collapse into a single variant listing
 * several {@code mappingDirs}. So {@code variants.size() == 1} means "canonical, no conflict"
 * and {@code variants.size() > 1} means "this corpus has no canonical DDL for this name" —
 * which is exactly the distinction {@link RegistryTableDto#columns()} (a UNION across every
 * file sharing the name) cannot express: for those 11 names the union matches no real file on
 * disk (measured: {@code DWH_MAPLESHORE_MAPLEBARN_MEMBERS} is 110 and 99 columns, union 116,
 * intersect 93, neither variant a subset of the other).
 */
public record RegistryVariantDto(List<RegistryColumnDto> columns, List<String> mappingDirs) {}
