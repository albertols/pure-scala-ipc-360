package io.pure360.etl360.service.ipc;

import java.util.Map;
import java.util.Set;

/**
 * Canonical IPC recipe vocabulary plus the anonymizer alias table.
 *
 * <p>The committed corpus is anonymized sample data (CLAUDE.md corpus caveats). Four step
 * {@code type} values and one structural key survive as anonymizer tokens rather than the
 * names {@code parser/src/main/scala/io/pure360/ipc/model/recipe/} actually emits. Each
 * mapping below is confirmed against the source XML — see
 * {@code AliasWitnessContractTest}, which re-asserts the exact witnesses, and spec §5.3.
 *
 * <p>This class NEVER rewrites corpus bytes. It resolves tokens for validation and display
 * only.
 */
public final class IpcVocabulary {
    private IpcVocabulary() {}

    /** Step target kinds — {@code AbstractTarget.scala:6-89}. */
    public static final Set<String> TARGET_TYPES = Set.of(
        "table", "unionInput", "sourceQualifier", "filter", "joinerInput",
        "aggregator", "router", "normalizer", "java", "storedProcedure");

    /** Step source kinds — {@code AbstractSource.scala:6-46}. */
    public static final Set<String> SOURCE_TYPES = Set.of(
        "table", "union", "sourceQualifier", "filter", "joiner",
        "aggregator", "router", "normalizer", "java", "storedProcedure");

    /**
     * Anonymized {@code type} token -> canonical kind. Witnesses (spec §5.3):
     * <ul>
     *   <li>{@code BERYLFALLS}: step {@code SQ_ff_BIZLINK} of {@code CDM/m_DM_INFOHUB_BIZLINK}
     *       is {@code <TRANSFORMATION TYPE="Source Qualifier">}.</li>
     *   <li>{@code ASHPATH2}: step {@code JNR_Ashshore.DETAIL} of
     *       {@code DWH/m_DWH_MAPLEGROVE_ACT_CLIENTMGR_PROFILES} is
     *       {@code <TRANSFORMATION TYPE="Joiner">}; the {@code .DETAIL} suffix is
     *       {@code AbstractTargetFactory.scala:88}.</li>
     *   <li>{@code CEDARWICK2}: step {@code SWIFTVALE_BIRCHMILL_OAKFORD_P_MAIN} of
     *       {@code QDM/m_GENERATE_ERROR_BRISKGROVE} is
     *       {@code <TRANSFORMATION TYPE="Stored Procedure">}.</li>
     *   <li>{@code EARLYGLADE}: step {@code LKP_CEDARMOOR_NETHUB_ELMYARD} of
     *       {@code CDM/m_DM_LKP_CONTACTREF_MEMBER_NETHUB_PAIR} is NOT a transformation name —
     *       it is {@code <GROUP TYPE="INPUT">}, which is exactly the input-group name
     *       {@code createUnionTarget} ({@code AbstractTargetFactory.scala:51-55}) gives a
     *       {@code UnionInputTarget}.</li>
     * </ul>
     */
    public static final Map<String, String> TYPE_ALIASES = Map.of(
        "BERYLFALLS", "sourceQualifier",
        "EARLYGLADE", "unionInput",
        "ASHPATH2", "joinerInput",
        "CEDARWICK2", "storedProcedure");

    /**
     * Anonymized structural key -> canonical key. {@code greencliff} holds a 14-entry
     * {@code RouterGroup} array ({@code AbstractTarget.scala:47}) on the corpus's single
     * router step {@code RTR_CIPHERKEY_OFFERING}, so it is {@code RouterTarget.groups}
     * ({@code AbstractTarget.scala:44}), not {@code updateOverride} — that Option is
     * {@code None} corpus-wide. {@code weststone} is the pre-repair {@code fields} spelling
     * (CLAUDE.md corpus caveats), still tolerated defensively.
     */
    public static final Map<String, String> KEY_ALIASES = Map.of(
        "greencliff", "groups",
        "weststone", "fields");

    public static String canonicalTargetType(String raw) { return resolve(raw, TARGET_TYPES); }

    public static String canonicalSourceType(String raw) { return resolve(raw, SOURCE_TYPES); }

    private static String resolve(String raw, Set<String> canonical) {
        if (raw == null) return "";
        if (canonical.contains(raw)) return raw;
        return TYPE_ALIASES.getOrDefault(raw, raw);
    }

    public static String canonicalKey(String rawKey) {
        if (rawKey == null) return "";
        return KEY_ALIASES.getOrDefault(rawKey, rawKey);
    }
}
