package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.B15RowDto;
import io.pure360.etl360.config.DataRoots;
import io.pure360.etl360.config.Etl360Properties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The status dialect, proven against a TEMP-DIR fixture written per test — the idiom
 * {@link B15ReaderTest} already uses.
 *
 * <p>Deliberately NOT proven by editing corpus data: the committed {@code m_CAS_*} b15 rows are
 * manifest-generated and frozen (root {@code CLAUDE.md}), so no mock floor moves for any of this
 * to pass. That is itself part of the claim.
 */
class B15ReaderStatusDialectTest {

    private static final String HEADER = "cluster_name,recipe_filename,job_id,app_start_iso,"
        + "avg_job_duration_in_mins_sec,status,message\n";

    /** The user-reported real-world shape, including a comma inside the quoted message. */
    private static final String DIALECT_ROWS =
        "cluster-xxx,_ETL_A_RECIPE.json,etl-a_recipe-20260818-0800,2026-08-18T06:01:11.117Z,"
            + "54m 37sec,FAILURE,\"Exception message: writeResultAndErrors failed: "
            + "[fullVersionedAudit] Failed to write staging table 'project.DWH.TABLE_X'. "
            + "No changes have been made to 'Table'.\"\n"
        + "cluster-xxx,_ETL_B_RECIPE.json,etl-b_recipe-20260818-0800,2026-08-18T06:02:11.117Z,"
            + "3m 04sec,SUCCEEDED,\n"
        + "cluster-xxx,_ETL_C_RECIPE.json,etl-c_recipe-20260818-0800,2026-08-18T06:03:11.117Z,"
            + "1m 12sec,SKIPPED,\n"
        + "cluster-xxx,_ETL_D_RECIPE.json,etl-d_recipe-20260818-0800,2026-08-18T06:04:11.117Z,"
            + "0m 44sec,success,\n";

    private static Path writeCsv(Path root, String body) throws Exception {
        Path day = Files.createDirectories(
            root.resolve(DataRoots.COMPOSER_INPUTS).resolve("2026_08_18"));
        Path csv = day.resolve(B15Reader.B15_FILENAME);
        Files.writeString(csv, HEADER + body);
        return csv;
    }

    private static B15Reader readerOver(Path composerRoot, Etl360Properties.B15 vocabulary) {
        Etl360Properties props = new Etl360Properties(
            "parser/src/main/resources/xmltobq", "does/not/exist",
            "backend/src/main/resources/mock", composerRoot.toString(), null,
            Etl360Properties.LayerToLayer.DEFAULTS, vocabulary);
        return new B15Reader(new DataRoots(props), props);
    }

    private static B15RowDto row(List<B15RowDto> rows, String recipe) {
        return rows.stream().filter(r -> r.recipeFilename().equals(recipe)).findFirst().orElseThrow();
    }

    @Test
    void failureBecomesFailedRatherThanPending(@TempDir Path tmp) throws Exception {
        // THE defect: FAILURE matched no literal, so a failed run rendered as "never ran".
        B15Reader reader = readerOver(tmp, Etl360Properties.B15.DEFAULTS);
        List<B15RowDto> rows = reader.rows(writeCsv(tmp, DIALECT_ROWS));

        assertThat(row(rows, "_ETL_A_RECIPE.json").status()).isEqualTo("FAILED");
    }

    @Test
    void succeededBecomesSuccess(@TempDir Path tmp) throws Exception {
        B15Reader reader = readerOver(tmp, Etl360Properties.B15.DEFAULTS);
        List<B15RowDto> rows = reader.rows(writeCsv(tmp, DIALECT_ROWS));

        assertThat(row(rows, "_ETL_B_RECIPE.json").status()).isEqualTo("SUCCESS");
    }

    @Test
    void aLowercaseTokenIsStillRecognized(@TempDir Path tmp) throws Exception {
        B15Reader reader = readerOver(tmp, Etl360Properties.B15.DEFAULTS);
        List<B15RowDto> rows = reader.rows(writeCsv(tmp, DIALECT_ROWS));

        assertThat(row(rows, "_ETL_D_RECIPE.json").status()).isEqualTo("SUCCESS");
    }

    @Test
    void anUnrecognizedTokenBecomesBlankAndIsReported(@TempDir Path tmp) throws Exception {
        B15Reader reader = readerOver(tmp, Etl360Properties.B15.DEFAULTS);
        List<B15RowDto> rows = reader.rows(writeCsv(tmp, DIALECT_ROWS));

        assertThat(row(rows, "_ETL_C_RECIPE.json").status()).isEmpty();
        // Swallowed statuses are what made this class of bug invisible. Report them.
        assertThat(reader.status().unrecognized()).containsEntry("SKIPPED", 1L);
    }

    @Test
    void theQuotedMessageCommaDoesNotShiftColumns(@TempDir Path tmp) throws Exception {
        // Guards the fixture itself: a naive split(",") pushes the message into `status`, which
        // would make the FAILURE assertion above pass for the wrong reason.
        B15Reader reader = readerOver(tmp, Etl360Properties.B15.DEFAULTS);
        B15RowDto r = row(reader.rows(writeCsv(tmp, DIALECT_ROWS)), "_ETL_A_RECIPE.json");

        assertThat(r.avgJobDurationInMinsSec()).isEqualTo("54m 37sec");
        assertThat(r.message()).startsWith("Exception message: writeResultAndErrors failed");
    }

    @Test
    void aConfiguredVocabularyOverridesTheDefault(@TempDir Path tmp) throws Exception {
        // The ADR-0013 escape hatch: a site whose export uses a dialect nobody anticipated fixes
        // it in config.json rather than in code.
        B15Reader reader = readerOver(tmp,
            new Etl360Properties.B15(List.of("SKIPPED"), List.of("FAILURE")));
        List<B15RowDto> rows = reader.rows(writeCsv(tmp, DIALECT_ROWS));

        assertThat(row(rows, "_ETL_C_RECIPE.json").status()).isEqualTo("SUCCESS");
        assertThat(row(rows, "_ETL_A_RECIPE.json").status()).isEqualTo("FAILED");
        assertThat(row(rows, "_ETL_B_RECIPE.json").status()).isEmpty();   // SUCCEEDED no longer listed
    }

    @Test
    void theCommittedMockDialectIsUnaffected(@TempDir Path tmp) throws Exception {
        // Canonical tokens canonicalise to themselves, which is why no committed floor moves.
        B15Reader reader = readerOver(tmp, Etl360Properties.B15.DEFAULTS);
        List<B15RowDto> rows = reader.rows(writeCsv(tmp,
            "c,_ETL_OK.json,j1,2026-08-18T06:00:00.000Z,1m 0sec,SUCCESS,\n"
                + "c,_ETL_KO.json,j2,2026-08-18T06:00:00.000Z,1m 0sec,FAILED,\n"
                + "c,_ETL_NA.json,j3,2026-08-18T06:00:00.000Z,1m 0sec,,\n"));

        assertThat(row(rows, "_ETL_OK.json").status()).isEqualTo("SUCCESS");
        assertThat(row(rows, "_ETL_KO.json").status()).isEqualTo("FAILED");
        assertThat(row(rows, "_ETL_NA.json").status()).isEmpty();
        assertThat(reader.status().unrecognized()).isEmpty();
    }
}
