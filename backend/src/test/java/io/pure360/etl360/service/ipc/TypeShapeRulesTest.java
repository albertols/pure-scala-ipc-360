package io.pure360.etl360.service.ipc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class TypeShapeRulesTest {
    private static final ObjectMapper M = new ObjectMapper();
    private final IpcCatalog catalog = new IpcCatalog();
    private final IpcRuleEngine engine = new IpcRuleEngine(catalog);

    private List<IpcCheck> failures(String json) throws Exception {
        return engine.run(M.readTree(json)).stream().filter(c -> "fail".equals(c.status())).toList();
    }

    private static String recipe(String targetJson) {
        return "{\"steps\":[{\"target\":" + targetJson + ",\"sources\":[]}],"
            + "\"table\":{\"targetTableNames\":[],\"sourceTableNames\":[]}}";
    }

    @Test
    void sourceQualifierWithoutSelectDistinctFails() throws Exception {
        assertThat(failures(recipe("{\"name\":\"SQ\",\"type\":\"sourceQualifier\",\"fields\":[]}")))
            .anyMatch(c -> c.ruleId().equals("IPC-TYP-SOURCEQUALIFIER-001"));
    }

    @Test
    void sourceQualifierWithSelectDistinctPasses() throws Exception {
        assertThat(failures(recipe(
            "{\"name\":\"SQ\",\"type\":\"sourceQualifier\",\"selectDistinct\":false,\"fields\":[]}")))
            .noneMatch(c -> c.ruleId().startsWith("IPC-TYP-SOURCEQUALIFIER-"));
    }

    @Test
    void anonymizedSourceQualifierIsCheckedUnderItsCanonicalKind() throws Exception {
        assertThat(failures(recipe("{\"name\":\"SQ\",\"type\":\"BERYLFALLS\",\"fields\":[]}")))
            .anyMatch(c -> c.ruleId().equals("IPC-TYP-SOURCEQUALIFIER-001"));
    }

    @Test
    void routerWithTwoDefaultGroupsFails() throws Exception {
        String t = """
            {"name":"RTR","type":"router","fields":[],"groups":[
              {"name":"A","default":true,"fields":[]},
              {"name":"B","default":true,"fields":[]}]}""";
        assertThat(failures(recipe(t))).anyMatch(c -> c.ruleId().equals("IPC-TYP-ROUTER-002"));
    }

    @Test
    void routerWithOneDefaultGroupPasses() throws Exception {
        String t = """
            {"name":"RTR","type":"router","fields":[],"groups":[
              {"name":"A","default":true,"fields":[]},
              {"name":"B","default":false,"fields":[]}]}""";
        assertThat(failures(recipe(t))).noneMatch(c -> c.ruleId().startsWith("IPC-TYP-ROUTER-"));
    }

    @Test
    void routerGroupsUnderTheAnonymizedKeyAreStillChecked() throws Exception {
        String t = """
            {"name":"RTR","type":"router","fields":[],"greencliff":[
              {"name":"A","default":true,"fields":[]},
              {"name":"B","default":true,"fields":[]}]}""";
        assertThat(failures(recipe(t))).anyMatch(c -> c.ruleId().equals("IPC-TYP-ROUTER-002"));
    }

    @Test
    void aggregatorWithoutGroupByFieldsFails() throws Exception {
        assertThat(failures(recipe("{\"name\":\"AGG\",\"type\":\"aggregator\",\"fields\":[]}")))
            .anyMatch(c -> c.ruleId().equals("IPC-TYP-AGGREGATOR-001"));
    }

    @Test
    void normalizerWithEmptyRefSourceFails() throws Exception {
        String t = """
            {"name":"NRM","type":"normalizer","fields":[],
             "normalizedFields":[{"name":"N","refSource":[]}]}""";
        assertThat(failures(recipe(t))).anyMatch(c -> c.ruleId().equals("IPC-TYP-NORMALIZER-002"));
    }

    @Test
    void joinerInputNameMustCarryMasterOrDetailSuffix() throws Exception {
        assertThat(failures(recipe("{\"name\":\"JNR_X\",\"type\":\"joinerInput\",\"fields\":[]}")))
            .anyMatch(c -> c.ruleId().equals("IPC-TYP-JOINERINPUT-001"));
        assertThat(failures(recipe("{\"name\":\"JNR_X.DETAIL\",\"type\":\"joinerInput\",\"fields\":[]}")))
            .noneMatch(c -> c.ruleId().equals("IPC-TYP-JOINERINPUT-001"));
    }

    @Test
    void joinerSourceRequiresItsThreeJoinKeys() throws Exception {
        String json = "{\"steps\":[{\"target\":{\"name\":\"T\",\"type\":\"table\",\"fields\":[]},"
            + "\"sources\":[{\"name\":\"J\",\"type\":\"joiner\"}]}],"
            + "\"table\":{\"targetTableNames\":[],\"sourceTableNames\":[]}}";
        assertThat(failures(json)).anyMatch(c -> c.ruleId().equals("IPC-TYP-JOINER-001"));
    }

    @Test
    void keySchemaCoversAllTwentyKinds() {
        assertThat(catalog.keySchema().keySet())
            .containsAll(IpcVocabulary.TARGET_TYPES.stream().map(t -> "target:" + t).toList())
            .containsAll(IpcVocabulary.SOURCE_TYPES.stream().map(t -> "source:" + t).toList());
    }

    @Test
    void everyKeySpecCarriesAWidget() {
        for (var entry : catalog.keySchema().entrySet()) {
            for (IpcCatalog.IpcKeySpec spec : entry.getValue()) {
                assertThat(spec.widget()).as(entry.getKey() + "." + spec.key()).isNotBlank();
            }
        }
    }
}
