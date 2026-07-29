package io.pure360.etl360.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Set;
import java.util.Spliterators;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.in;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class ConfigControllerTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper objectMapper;

    // The exact AppConfigDto field set — nothing secret-ish beyond these 8 belongs here.
    private static final Set<String> EXPECTED_FIELDS = Set.of(
        "projectId", "region", "dataprocJobUrl", "dataprocClusterUrl",
        "loggingUrl", "dwhControlMode", "composerMode", "corpusRoot");

    @Test
    void servesSanitizedConfigWithExactlyTheEightExpectedFields() throws Exception {
        String body = mvc.perform(get("/api/config"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.dwhControlMode").value(in(List.of("real", "mock", "absent"))))
            .andExpect(jsonPath("$.composerMode").value(in(List.of("real", "absent"))))
            .andReturn().getResponse().getContentAsString();

        JsonNode json = objectMapper.readTree(body);
        Set<String> actualFields = StreamSupport.stream(
                Spliterators.spliteratorUnknownSize(json.fieldNames(), 0), false)
            .collect(Collectors.toSet());

        assertThat(actualFields).containsExactlyInAnyOrderElementsOf(EXPECTED_FIELDS);
    }
}
