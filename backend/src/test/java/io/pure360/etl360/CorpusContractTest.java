package io.pure360.etl360;

import io.pure360.etl360.service.CorpusService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class CorpusContractTest {
    @Autowired MockMvc mvc;
    @Autowired CorpusService corpus;

    @Test
    void everyMappingServesDomAndModel() throws Exception {
        List<String> mappings = corpus.allXmlPaths();
        // 46 lowercase .xml + 13 uppercase .XML — see CLAUDE.md corpus caveats.
        assertThat(mappings).hasSizeGreaterThanOrEqualTo(59);
        for (String m : mappings) {
            mvc.perform(get("/api/mappings/dom/" + m)).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").exists());
            mvc.perform(get("/api/mappings/model/" + m)).andExpect(status().isOk())
                .andExpect(jsonPath("$.repository").exists());
        }
    }

    @Test
    void everyRecipeServes() throws Exception {
        List<String> recipes = corpus.allRecipePaths();
        assertThat(recipes).hasSizeGreaterThanOrEqualTo(64);
        for (String r : recipes) {
            mvc.perform(get("/api/recipes/" + r)).andExpect(status().isOk())
                .andExpect(jsonPath("$.content").exists());
        }
    }
}
