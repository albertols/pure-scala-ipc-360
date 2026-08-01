package io.pure360.etl360.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.greaterThan;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Task 9: {@code GET /api/ipc/rules} gains {@code connections}, so the frontend holds no
 * second copy of the adjacency matrix Task 8 authored. */
@SpringBootTest
@AutoConfigureMockMvc
class IpcControllerTest {
    @Autowired MockMvc mvc;

    @Test
    void rulesServeTheConnectionMatrix() throws Exception {
        mvc.perform(get("/api/ipc/rules"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.connections.sourceQualifier.mayFeed.length()").value(greaterThan(0)));
    }
}
