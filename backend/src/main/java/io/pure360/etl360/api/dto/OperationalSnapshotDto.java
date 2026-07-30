package io.pure360.etl360.api.dto;

import java.util.List;

public record OperationalSnapshotDto(String date, List<B15RowDto> rows) {}
