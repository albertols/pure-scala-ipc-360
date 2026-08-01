package io.pure360.etl360.service.ipc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class StructuralRulesTest {
    private static final ObjectMapper M = new ObjectMapper();
    private final IpcRuleEngine engine = new IpcRuleEngine(new IpcCatalog());

    private List<IpcCheck> failures(String json) throws Exception {
        JsonNode n = M.readTree(json);
        return engine.run(n).stream().filter(c -> "fail".equals(c.status())).toList();
    }

    private static final String VALID = """
        {"steps":[{"target":{"name":"T","type":"table","fields":[
            {"name":"A","dataType":"String","transformation":{"source":"S.A"}}]},
          "sources":[{"name":"S","type":"table"}]}],
         "table":{"targetTableNames":["T"],"sourceTableNames":["S"]}}""";

    @Test
    void aWellFormedRecipeHasNoStructuralFailures() throws Exception {
        assertThat(failures(VALID)).noneMatch(c -> c.ruleId().startsWith("IPC-STR-"));
    }

    @Test
    void emptyStepsFails() throws Exception {
        assertThat(failures("{\"steps\":[],\"table\":{}}"))
            .anyMatch(c -> c.ruleId().equals("IPC-STR-001"));
    }

    @Test
    void blankTargetNameFails() throws Exception {
        String json = VALID.replace("\"name\":\"T\"", "\"name\":\"\"");
        assertThat(failures(json)).anyMatch(c -> c.ruleId().equals("IPC-STR-003"));
    }

    @Test
    void unknownTargetTypeFails() throws Exception {
        String json = VALID.replace("\"type\":\"table\"", "\"type\":\"NOSUCHTYPE\"");
        assertThat(failures(json)).anyMatch(c -> c.ruleId().equals("IPC-STR-005"));
    }

    @Test
    void anonymizedTargetTypeDoesNotFail() throws Exception {
        String json = VALID.replace("\"type\":\"table\"", "\"type\":\"BERYLFALLS\"");
        assertThat(failures(json)).noneMatch(c -> c.ruleId().equals("IPC-STR-005"));
    }

    @Test
    void duplicateTargetNamesFail() throws Exception {
        String json = """
            {"steps":[
              {"target":{"name":"T","type":"table","fields":[]},"sources":[]},
              {"target":{"name":"T","type":"filter","fields":[]},"sources":[]}],
             "table":{"targetTableNames":["T"],"sourceTableNames":[]}}""";
        assertThat(failures(json)).anyMatch(c -> c.ruleId().equals("IPC-STR-006"));
    }

    @Test
    void duplicateFieldNamesWithinATargetFail() throws Exception {
        String json = """
            {"steps":[{"target":{"name":"T","type":"table","fields":[
                {"name":"A","dataType":"String","transformation":{"value":"1"}},
                {"name":"A","dataType":"String","transformation":{"value":"2"}}]},
              "sources":[]}],
             "table":{"targetTableNames":["T"],"sourceTableNames":[]}}""";
        assertThat(failures(json)).anyMatch(c -> c.ruleId().equals("IPC-STR-007"));
    }

    @Test
    void unknownDataTypeFails() throws Exception {
        String json = VALID.replace("\"dataType\":\"String\"", "\"dataType\":\"Blob\"");
        assertThat(failures(json)).anyMatch(c -> c.ruleId().equals("IPC-STR-008"));
    }

    @Test
    void weststoneFieldsKeyIsStillTolerated() throws Exception {
        String json = VALID.replace("\"fields\":", "\"weststone\":");
        assertThat(failures(json)).noneMatch(c -> c.ruleId().startsWith("IPC-STR-"));
    }

    @Test
    void everyEmittedCheckIdExistsInTheCatalogue() throws Exception {
        IpcCatalog catalog = new IpcCatalog();
        for (IpcCheck c : engine.run(M.readTree(VALID))) {
            assertThat(catalog.meta(c.ruleId())).as("catalogue entry for " + c.ruleId()).isNotNull();
        }
    }
}
