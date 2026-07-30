package io.pure360.etl360.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Spec §6: an exception type not explicitly mapped by {@link ApiExceptionHandler} (a TOCTOU
 * race surfacing as {@code UncheckedIOException}, an {@code IllegalStateException}, ...) must
 * still come back as {@code application/problem+json} with a correlation id — never Spring
 * Boot's default error body, and never a stack trace in the response.
 *
 * {@link Boom} is a test-only controller wired in only for this test's context via
 * {@code @Import}, not picked up by any other test's application context.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(ApiExceptionHandlerTest.Boom.class)
class ApiExceptionHandlerTest {
    @Autowired MockMvc mvc;

    @RestController
    static class Boom {
        @GetMapping("/api/test-only/boom")
        String boom() {
            throw new IllegalStateException("kaboom - unmapped exception for test purposes");
        }
    }

    @Test
    void unmappedExceptionMapsToProblemJson500WithCorrelationId() throws Exception {
        mvc.perform(get("/api/test-only/boom"))
            .andExpect(status().isInternalServerError())
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("$.title").value("Internal error"))
            .andExpect(jsonPath("$.correlationId").exists())
            .andExpect(jsonPath("$.correlationId").isNotEmpty())
            // no leaked stack trace / exception class name in the body
            .andExpect(jsonPath("$.detail").value(not(containsString("IllegalStateException"))))
            .andExpect(jsonPath("$.trace").doesNotExist());
    }
}
