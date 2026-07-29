package io.pure360.etl360.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record XmlNodeDto(String name, Map<String, String> attributes,
                         String text, List<XmlNodeDto> children) {}
