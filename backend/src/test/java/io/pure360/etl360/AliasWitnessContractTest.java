package io.pure360.etl360;

import io.pure360.etl360.service.ipc.IpcVocabulary;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Re-asserts spec §5.3's alias witnesses against the committed corpus XML, so the alias table
 * can never silently drift from the data it claims to describe.
 */
class AliasWitnessContractTest {
    private static final Path CORPUS = Path.of("../parser/src/main/resources/xmltobq");

    private static String xml(String mappingPath) throws Exception {
        Path p = CORPUS.resolve(mappingPath + ".xml");
        if (!Files.isRegularFile(p)) p = CORPUS.resolve(mappingPath + ".XML");
        return Files.readString(p, StandardCharsets.UTF_8);
    }

    private static String transformationType(String doc, String name) {
        Matcher m = Pattern.compile("<TRANSFORMATION\\b[^>]*NAME\\s*=\\s*\"" + Pattern.quote(name)
            + "\"[^>]*TYPE\\s*=\\s*\"([^\"]*)\"").matcher(doc);
        return m.find() ? m.group(1) : null;
    }

    @Test
    void berylfallsIsASourceQualifier() throws Exception {
        assertThat(transformationType(xml("CDM/m_DM_INFOHUB_BIZLINK"), "SQ_ff_BIZLINK"))
            .isEqualTo("Source Qualifier");
        assertThat(IpcVocabulary.canonicalTargetType("BERYLFALLS")).isEqualTo("sourceQualifier");
    }

    @Test
    void ashpath2IsAJoiner() throws Exception {
        assertThat(transformationType(
            xml("DWH/m_DWH_MAPLEGROVE_ACT_CLIENTMGR_PROFILES"), "JNR_Ashshore")).isEqualTo("Joiner");
        assertThat(IpcVocabulary.canonicalTargetType("ASHPATH2")).isEqualTo("joinerInput");
    }

    @Test
    void cedarwick2IsAStoredProcedure() throws Exception {
        assertThat(transformationType(
            xml("QDM/m_GENERATE_ERROR_BRISKGROVE"), "SWIFTVALE_BIRCHMILL_OAKFORD_P_MAIN"))
            .isEqualTo("Stored Procedure");
        assertThat(IpcVocabulary.canonicalTargetType("CEDARWICK2")).isEqualTo("storedProcedure");
    }

    /** EARLYGLADE names an INPUT group, not a transformation — different evidence class. */
    @Test
    void earlygladeIsAUnionInputGroupName() throws Exception {
        String doc = xml("CDM/m_DM_LKP_CONTACTREF_MEMBER_NETHUB_PAIR");
        assertThat(transformationType(doc, "LKP_CEDARMOOR_NETHUB_ELMYARD")).isNull();
        assertThat(doc).containsPattern(
            "<GROUP\\b[^>]*NAME\\s*=\\s*\"LKP_CEDARMOOR_NETHUB_ELMYARD\"[^>]*TYPE\\s*=\\s*\"INPUT\"");
        assertThat(IpcVocabulary.canonicalTargetType("EARLYGLADE")).isEqualTo("unionInput");
    }

    @Test
    void greencliffIsRouterGroups() throws Exception {
        assertThat(transformationType(
            xml("ETL/m_DWH_E_MAPLEGROVE_DEALFLOW_MIS_GCP1"), "RTR_CIPHERKEY_OFFERING"))
            .isEqualTo("Router");
        assertThat(IpcVocabulary.canonicalKey("greencliff")).isEqualTo("groups");
    }
}
