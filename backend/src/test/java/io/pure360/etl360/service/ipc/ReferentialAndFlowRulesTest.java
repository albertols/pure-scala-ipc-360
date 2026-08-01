package io.pure360.etl360.service.ipc;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ReferentialAndFlowRulesTest {
    private static final ObjectMapper M = new ObjectMapper();
    private final IpcRuleEngine engine = new IpcRuleEngine(new IpcCatalog());

    private List<String> failedIds(String json) throws Exception {
        return engine.run(M.readTree(json)).stream()
            .filter(c -> "fail".equals(c.status())).map(IpcCheck::ruleId).toList();
    }

    /** Source table S -> sourceQualifier SQ -> target table T. Clean on every family. */
    private static final String CHAIN = """
        {"steps":[
          {"target":{"name":"SQ","type":"sourceQualifier","selectDistinct":false,"fields":[
              {"name":"A","dataType":"String","transformation":{"source":"S.A"}}]},
           "sources":[{"name":"S","type":"table"}]},
          {"target":{"name":"T","type":"table","fields":[
              {"name":"A","dataType":"String","transformation":{"source":"SQ.A"}}]},
           "sources":[{"name":"SQ","type":"sourceQualifier"}]}],
         "table":{"targetTableNames":["T"],"sourceTableNames":["S"]}}""";

    @Test
    void aCleanChainHasNoReferentialOrFlowFailures() throws Exception {
        assertThat(failedIds(CHAIN)).noneMatch(id -> id.startsWith("IPC-REF-") || id.startsWith("IPC-FLW-"));
    }

    @Test
    void unresolvableRefTableFails() throws Exception {
        assertThat(failedIds(CHAIN.replace("\"source\":\"S.A\"", "\"source\":\"NOPE.A\"")))
            .contains("IPC-REF-001");
    }

    @Test
    void refToAMissingFieldOfAKnownStepFails() throws Exception {
        assertThat(failedIds(CHAIN.replace("\"source\":\"SQ.A\"", "\"source\":\"SQ.ZZZ\"")))
            .contains("IPC-REF-002");
    }

    /** IPC-REF-002's three kind-specific namespaces (spec §5.4 fix-round): a router's
     * group-qualified port, a normalizer's normalizedFields output, a storedProcedure's
     * returnField — each resolves even though none is in the target's plain {@code fields}. */
    @Test
    void routerGroupQualifiedRefResolvesAgainstThatGroupsOwnFields() throws Exception {
        String json = """
            {"steps":[
              {"target":{"name":"RTR","type":"router","fields":[
                  {"name":"X","dataType":"String","transformation":{"source":"S.X"}}],
                  "groups":[{"name":"G1","default":false,"fields":[
                      {"name":"PORT1","dataType":"String","transformation":{"source":"RTR.X"}}]}]},
               "sources":[{"name":"S","type":"table"}]},
              {"target":{"name":"T","type":"table","fields":[
                  {"name":"A","dataType":"String","transformation":{"source":"RTR.G1.PORT1"}}]},"sources":[]}],
             "table":{"targetTableNames":["T"],"sourceTableNames":["S"]}}""";
        assertThat(failedIds(json)).doesNotContain("IPC-REF-002");
    }

    @Test
    void routerGroupQualifiedRefToAnUnknownPortInAKnownGroupStillFails() throws Exception {
        String json = """
            {"steps":[
              {"target":{"name":"RTR","type":"router","fields":[
                  {"name":"X","dataType":"String","transformation":{"source":"S.X"}}],
                  "groups":[{"name":"G1","default":false,"fields":[
                      {"name":"PORT1","dataType":"String","transformation":{"source":"RTR.X"}}]}]},
               "sources":[{"name":"S","type":"table"}]},
              {"target":{"name":"T","type":"table","fields":[
                  {"name":"A","dataType":"String","transformation":{"source":"RTR.G1.NOPE"}}]},"sources":[]}],
             "table":{"targetTableNames":["T"],"sourceTableNames":["S"]}}""";
        assertThat(failedIds(json)).contains("IPC-REF-002");
    }

    @Test
    void normalizerOutputPortRefResolvesAgainstNormalizedFields() throws Exception {
        String json = """
            {"steps":[
              {"target":{"name":"NRM","type":"normalizer",
                  "fields":[{"name":"X_in","dataType":"String","transformation":{"source":"S.X"}}],
                  "normalizedFields":[{"name":"X","refSource":["X_in"],"generatedColumnId":false,"generatedKey":false}]},
               "sources":[{"name":"S","type":"table"}]},
              {"target":{"name":"T","type":"table","fields":[
                  {"name":"A","dataType":"String","transformation":{"source":"NRM.X"}}]},"sources":[]}],
             "table":{"targetTableNames":["T"],"sourceTableNames":["S"]}}""";
        assertThat(failedIds(json)).doesNotContain("IPC-REF-002");
    }

    @Test
    void storedProcedureReturnFieldRefResolves() throws Exception {
        String json = """
            {"steps":[
              {"target":{"name":"SP","type":"storedProcedure","procedureName":"P","returnField":"RV","fields":[]},
               "sources":[]},
              {"target":{"name":"T","type":"table","fields":[
                  {"name":"A","dataType":"String","transformation":{"source":"SP.RV"}}]},"sources":[]}],
             "table":{"targetTableNames":["T"],"sourceTableNames":[]}}""";
        assertThat(failedIds(json)).doesNotContain("IPC-REF-002");
    }

    /** The important negative case, mirroring
     * {@code ExpressionRulesTest.aBogusNameNeitherMarkerNorFunctionNorLookupStillFails}: a
     * genuinely unresolvable field ref still fails IPC-REF-002 even after the router/
     * normalizer/storedProcedure exemptions — proves the rule kept its teeth. */
    @Test
    void aGenuinelyUnresolvableStoredProcedureFieldRefStillFails() throws Exception {
        String json = """
            {"steps":[
              {"target":{"name":"SP","type":"storedProcedure","procedureName":"P","returnField":"RV","fields":[]},
               "sources":[]},
              {"target":{"name":"T","type":"table","fields":[
                  {"name":"A","dataType":"String","transformation":{"source":"SP.NOPE"}}]},"sources":[]}],
             "table":{"targetTableNames":["T"],"sourceTableNames":[]}}""";
        assertThat(failedIds(json)).contains("IPC-REF-002");
    }

    @Test
    void selfReferenceFails() throws Exception {
        assertThat(failedIds(CHAIN.replace("\"source\":\"SQ.A\"", "\"source\":\"T.A\"")))
            .contains("IPC-REF-004");
    }

    @Test
    void targetTableMissingFromTargetTableNamesFails() throws Exception {
        assertThat(failedIds(CHAIN.replace("\"targetTableNames\":[\"T\"]", "\"targetTableNames\":[]")))
            .contains("IPC-REF-005");
    }

    @Test
    void aTwoStepCycleFails() throws Exception {
        String cyclic = """
            {"steps":[
              {"target":{"name":"A","type":"filter","fields":[
                  {"name":"X","dataType":"String","transformation":{"source":"B.X"}}]},"sources":[]},
              {"target":{"name":"B","type":"filter","fields":[
                  {"name":"X","dataType":"String","transformation":{"source":"A.X"}}]},"sources":[]}],
             "table":{"targetTableNames":[],"sourceTableNames":[]}}""";
        assertThat(failedIds(cyclic)).contains("IPC-REF-006");
    }

    @Test
    void unknownExpressionFunctionFails() throws Exception {
        String json = CHAIN.replace("\"transformation\":{\"source\":\"S.A\"}",
            "\"transformation\":{\"name\":\"NOT_A_FUNCTION\",\"parameters\":[{\"source\":\"S.A\"}]}");
        assertThat(failedIds(json)).contains("IPC-EXP-001");
    }

    @Test
    void knownPredefinedFunctionPasses() throws Exception {
        String json = CHAIN.replace("\"transformation\":{\"source\":\"S.A\"}",
            "\"transformation\":{\"name\":\"SUBSTR\",\"parameters\":[{\"source\":\"S.A\"}]}");
        assertThat(failedIds(json)).doesNotContain("IPC-EXP-001");
    }

    @Test
    void expMarkerNamesPass() throws Exception {
        String json = CHAIN.replace("\"transformation\":{\"source\":\"S.A\"}",
            "\"transformation\":{\"name\":\"EXP_DECODE\",\"parameters\":[{\"source\":\"S.A\"}]}");
        assertThat(failedIds(json)).doesNotContain("IPC-EXP-001");
    }

    /** A lookup call-tree node's {@code name} is the Lookup transformation's own instance name
     * (e.g. {@code "LKP_CUSTOM_LOOKUP"}, deliberately NOT an {@code EXP_} marker here so this
     * exercises the {@code outputField}-shaped exemption, not the {@code EXP_} prefix one). */
    @Test
    void lookupShapedCallSitePasses() throws Exception {
        String json = CHAIN.replace("\"transformation\":{\"source\":\"S.A\"}", """
            "transformation":{"name":"LKP_CUSTOM_LOOKUP","outputField":"O","table":"L",
              "condition":"K = in_K","matchPolicy":"First",
              "parameters":[{"source":"S.A"}]}""");
        assertThat(failedIds(json)).doesNotContain("IPC-EXP-001");
    }

    @Test
    void sequenceGeneratorMarkerPasses() throws Exception {
        String json = CHAIN.replace("\"transformation\":{\"source\":\"S.A\"}",
            "\"transformation\":{\"name\":\"SequenceGenerator\"}");
        assertThat(failedIds(json)).doesNotContain("IPC-EXP-001");
    }

    @Test
    void undefinedMarkerPasses() throws Exception {
        String json = CHAIN.replace("\"transformation\":{\"source\":\"S.A\"}",
            "\"transformation\":{\"name\":\"Undefined\",\"parameters\":[{\"source\":\"S.A\"}]}");
        assertThat(failedIds(json)).doesNotContain("IPC-EXP-001");
    }

    /** The important negative case: a genuinely bogus call-tree name still fails IPC-EXP-001
     * even after the lookup/SequenceGenerator/Undefined exemptions — proves the rule kept its
     * teeth. ({@code unknownExpressionFunctionFails} above already covers this with
     * {@code "NOT_A_FUNCTION"}; restated here for clarity next to the new exemption tests.) */
    @Test
    void aBogusNameNeitherMarkerNorFunctionNorLookupStillFails() throws Exception {
        String json = CHAIN.replace("\"transformation\":{\"source\":\"S.A\"}",
            "\"transformation\":{\"name\":\"NOT_A_FUNCTION\",\"parameters\":[{\"source\":\"S.A\"}]}");
        assertThat(failedIds(json)).contains("IPC-EXP-001");
    }

    @Test
    void badLookupMatchPolicyFails() throws Exception {
        String json = CHAIN.replace("\"transformation\":{\"source\":\"S.A\"}", """
            "transformation":{"name":"EXP_LOOKUP","outputField":"O","table":"L",
              "condition":"K = in_K","matchPolicy":"Maybe",
              "parameters":[{"name":"in_K","dataType":"String","transformation":{"source":"S.A"}}]}""");
        assertThat(failedIds(json)).contains("IPC-EXP-003");
    }

    @Test
    void lookupConditionNotReferencingABindVariableFails() throws Exception {
        String json = CHAIN.replace("\"transformation\":{\"source\":\"S.A\"}", """
            "transformation":{"name":"EXP_LOOKUP","outputField":"O","table":"L",
              "condition":"K = 1","matchPolicy":"First",
              "parameters":[{"name":"in_K","dataType":"String","transformation":{"source":"S.A"}}]}""");
        assertThat(failedIds(json)).contains("IPC-FLW-004");
    }

    @Test
    void knownArithmeticOperatorLiteralPasses() throws Exception {
        String json = CHAIN.replace("\"transformation\":{\"source\":\"S.A\"}",
            "\"transformation\":{\"name\":\"EXP_ARITHMETIC\",\"parameters\":["
                + "{\"source\":\"S.A\"},{\"value\":\"*\"},{\"value\":\"2\"}]}");
        assertThat(failedIds(json)).doesNotContain("IPC-EXP-002");
    }

    @Test
    void unknownOperatorLiteralFails() throws Exception {
        String json = CHAIN.replace("\"transformation\":{\"source\":\"S.A\"}",
            "\"transformation\":{\"name\":\"EXP_ARITHMETIC\",\"parameters\":["
                + "{\"source\":\"S.A\"},{\"value\":\"§\"},{\"value\":\"2\"}]}");
        assertThat(failedIds(json)).contains("IPC-EXP-002");
    }

    /** A bare {value} node in a NON-operator position (an operand of EXP_ARITHMETIC, or any
     * parameter of a plain predefined-function call) is a literal, not an operator, and must
     * never be checked against the operator sets — this is the shape most likely to produce
     * false positives against the real corpus. */
    @Test
    void literalValueOutsideAnOperatorPositionNeverFailsExp002() throws Exception {
        String arithmeticOperand = CHAIN.replace("\"transformation\":{\"source\":\"S.A\"}",
            "\"transformation\":{\"name\":\"EXP_ARITHMETIC\",\"parameters\":["
                + "{\"source\":\"S.A\"},{\"value\":\"*\"},{\"value\":\"2\"}]}");
        assertThat(failedIds(arithmeticOperand)).doesNotContain("IPC-EXP-002");

        String plainFunctionParam = CHAIN.replace("\"transformation\":{\"source\":\"S.A\"}",
            "\"transformation\":{\"name\":\"SUBSTR\",\"parameters\":[{\"source\":\"S.A\"},{\"value\":\"2\"}]}");
        assertThat(failedIds(plainFunctionParam)).doesNotContain("IPC-EXP-002");
    }
}
