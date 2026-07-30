package io.pure360.etl360.api.dto;

public record B15RowDto(String clusterName, String recipeFilename, String jobId,
                        String appStartIso, String avgJobDurationInMinsSec,
                        String status, String message) {}
