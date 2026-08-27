package io.pure360.etl360.service;

import io.pure360.etl360.api.dto.B15RowDto;
import io.pure360.etl360.config.DataRoots;
import io.pure360.etl360.config.Etl360Properties;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class B15ReaderTest {

    private static B15Reader readerOver(Path composerRoot) {
        Etl360Properties props = new Etl360Properties(
            "parser/src/main/resources/xmltobq", "does/not/exist",
            "backend/src/main/resources/mock", composerRoot.toString(), null);
        return new B15Reader(new DataRoots(props));
    }

    private static Path writeCsv(Path dir, String date, String body) throws Exception {
        Path day = Files.createDirectories(dir.resolve("dwh/config/cluster_tuning/inputs").resolve(date));
        Path csv = day.resolve("b15_application_end_with_recipe_null_status.csv");
        Files.writeString(csv, "cluster_name,recipe_filename,job_id,app_start_iso,"
            + "avg_job_duration_in_mins_sec,status,message\n" + body);
        return csv;
    }

    @Test
    void datesAreAscendingIsoAndOnlyIncludeDirsThatActuallyHoldACsv(@org.junit.jupiter.api.io.TempDir Path tmp) throws Exception {
        writeCsv(tmp, "2026_07_20", "c,r.json,j,2026-07-20T01:00:00.000Z,1m 0sec,SUCCESS,\n");
        writeCsv(tmp, "2026_07_18", "c,r.json,j,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,\n");
        Files.createDirectories(tmp.resolve("dwh/config/cluster_tuning/inputs/2026_07_19"));  // no CSV

        assertThat(readerOver(tmp).dates()).containsExactly("2026-07-18", "2026-07-20");
    }

    @Test
    void anUnchangedFileIsParsedOnceAndTheSameImmutableListIsReturned(@org.junit.jupiter.api.io.TempDir Path tmp) throws Exception {
        Path csv = writeCsv(tmp, "2026_07_18", "c1,r.json,j1,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,\n");
        B15Reader reader = readerOver(tmp);

        List<B15RowDto> first = reader.rows(csv);
        List<B15RowDto> second = reader.rows(csv);

        assertThat(first).hasSize(1);
        assertThat(second).isSameAs(first);   // cache hit, not a re-parse
    }

    @Test
    void aChangedFileIsReparsed(@org.junit.jupiter.api.io.TempDir Path tmp) throws Exception {
        Path csv = writeCsv(tmp, "2026_07_18", "c1,r.json,j1,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,\n");
        B15Reader reader = readerOver(tmp);
        List<B15RowDto> first = reader.rows(csv);

        Files.writeString(csv, Files.readString(csv)
            + "c2,r2.json,j2,2026-07-18T02:00:00.000Z,2m 0sec,FAILED,boom\n");
        Files.setLastModifiedTime(csv, java.nio.file.attribute.FileTime.fromMillis(
            Files.getLastModifiedTime(csv).toMillis() + 2000));

        List<B15RowDto> second = reader.rows(csv);
        assertThat(second).hasSize(2);
        assertThat(second.get(1).status()).isEqualTo("FAILED");
    }

    @Test
    void missingCellsNormalizeToEmptyStringNotNull(@org.junit.jupiter.api.io.TempDir Path tmp) throws Exception {
        Path csv = writeCsv(tmp, "2026_07_18", "c1,r.json,j1,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS\n");
        assertThat(readerOver(tmp).rows(csv).get(0).message()).isEmpty();
    }

    @Test
    void fingerprintChangesWhenADateDirectoryAppears(@org.junit.jupiter.api.io.TempDir Path tmp) throws Exception {
        writeCsv(tmp, "2026_07_18", "c,r.json,j,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,\n");
        B15Reader reader = readerOver(tmp);
        String before = reader.fingerprint();

        writeCsv(tmp, "2026_07_19", "c,r.json,j,2026-07-19T01:00:00.000Z,1m 0sec,SUCCESS,\n");

        assertThat(reader.fingerprint()).isNotEqualTo(before);
    }

    @Test
    void fingerprintSkipsAB15CsvThatVanishesBetweenListingAndStatInsteadOfThrowing(
            @org.junit.jupiter.api.io.TempDir Path tmp) throws Exception {
        Path csv = writeCsv(tmp, "2026_07_18", "c,r.json,j,2026-07-18T01:00:00.000Z,1m 0sec,SUCCESS,\n");
        B15Reader reader = readerOver(tmp);
        byte[] body = Files.readAllBytes(csv);
        String before = reader.fingerprint();

        // dayDirs() re-verifies the CSV is present before every fingerprint() call, so a plain
        // delete-then-call never reaches the race: it just gets filtered out cleanly. Force the
        // actual TOCTOU window — the CSV vanishing *between* dayDirs()'s listing check and
        // fingerprint()'s own stat, inside the same call — with a background thread that keeps
        // deleting and recreating the file while the foreground hammers fingerprint().
        java.util.concurrent.atomic.AtomicBoolean stop = new java.util.concurrent.atomic.AtomicBoolean(false);
        java.util.concurrent.atomic.AtomicReference<Throwable> failure = new java.util.concurrent.atomic.AtomicReference<>();
        Thread flapper = new Thread(() -> {
            while (!stop.get()) {
                try {
                    Files.deleteIfExists(csv);
                    Files.write(csv, body);
                } catch (IOException ignored) {
                    // benign: the foreground may be mid-stat while we're mid-write
                }
            }
        });
        flapper.start();
        try {
            for (int i = 0; i < 20_000 && failure.get() == null; i++) {
                try {
                    reader.fingerprint();
                } catch (Throwable t) {
                    failure.set(t);
                }
            }
        } finally {
            stop.set(true);
            flapper.join();
        }

        assertThat(failure.get()).as("fingerprint() must skip a raced-away file, not throw").isNull();
        Files.deleteIfExists(csv);
        Files.write(csv, body);
        assertThat(reader.fingerprint()).isNotEqualTo(before).isNotBlank();
    }
}
