package io.pure360.etl360.service;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Counts this repository's own progress ledger: ticked and unticked checkboxes across
 * {@code docs/superpowers/plans/*.md}, and the numbered ADRs under {@code docs/adr/} —
 * {@code 0000-template.md} excluded, since 0000 is this repo's reserved template prefix,
 * not a real decision (real ADRs start at 0001).
 *
 * <p>This is the honest source for "feature progress" — {@code gh} is not installed on the target
 * machine and the GitHub API is unreachable from the app, and per {@code CLAUDE.md} the plan
 * checkboxes ARE this project's progress record.
 *
 * <p><b>{@link #scan()} returns null rather than throwing when progress cannot be determined.</b>
 * Two things can go wrong and both are legitimate: a packaged deployment need not ship {@code docs/},
 * and {@link io.pure360.etl360.config.RepoRoot#resolve} throws when it cannot find a
 * {@code pom.xml}+{@code parser/} ancestor. A landing page that fails because documentation is
 * missing would be absurd — the page renders every other section and omits progress.
 */
@Component
public class ProgressScanner {
    /** Leading whitespace then "- [x]" / "- [ ]". Mid-sentence mentions are prose, not checkboxes. */
    private static final Pattern DONE = Pattern.compile("^\\s*- \\[x\\]", Pattern.MULTILINE);
    private static final Pattern ANY  = Pattern.compile("^\\s*- \\[[ x]\\]", Pattern.MULTILINE);
    /** Numbered ADRs, EXCLUDING 0000- — this repo's own convention is that 0000 is always
     *  the template (see {@code docs/adr/0000-template.md}), never a real decision. Keyed on
     *  the prefix, not the literal filename, so a future 0000-anything.md is excluded too. */
    private static final Pattern ADR  = Pattern.compile("(?!0000-)\\d{4}-.*\\.md");

    public record Progress(int tasksDone, int tasksTotal, int adrs) {}

    private final Path startDir;
    private volatile String fingerprint;
    private volatile Progress cached;

    public ProgressScanner() {
        this(Path.of(System.getProperty("user.dir")));
    }

    ProgressScanner(Path startDir) {
        this.startDir = startDir;
    }

    /** @return counts, or null when {@code docs/} is unreachable — see the class javadoc. */
    public Progress scan() {
        Path docs = docsDir();
        if (docs == null) return null;
        String fp = fingerprint(docs);
        Progress hit = cached;
        if (hit != null && fp.equals(fingerprint)) return hit;
        synchronized (this) {
            if (cached != null && fp.equals(fingerprint)) return cached;
            Progress built = build(docs);
            cached = built;
            fingerprint = fp;
            return built;
        }
    }

    /** Null when the repo root cannot be resolved OR docs/ is not there. Never throws. */
    private Path docsDir() {
        try {
            Path docs = io.pure360.etl360.config.RepoRoot.resolve(startDir).resolve("docs");
            return Files.isDirectory(docs) ? docs : null;
        } catch (IllegalStateException e) {
            return null;
        }
    }

    private Progress build(Path docs) {
        int done = 0, total = 0;
        for (Path plan : listMarkdown(docs.resolve("superpowers/plans"))) {
            String text = read(plan);
            done += DONE.matcher(text).results().toList().size();
            total += ANY.matcher(text).results().toList().size();
        }
        int adrs = 0;
        for (Path adr : listMarkdown(docs.resolve("adr"))) {
            if (ADR.matcher(adr.getFileName().toString()).matches()) adrs++;
        }
        return new Progress(done, total, adrs);
    }

    private String fingerprint(Path docs) {
        StringBuilder sb = new StringBuilder();
        for (Path dir : List.of(docs.resolve("superpowers/plans"), docs.resolve("adr"))) {
            for (Path f : listMarkdown(dir)) {
                try {
                    BasicFileAttributes a = Files.readAttributes(f, BasicFileAttributes.class);
                    sb.append(f).append('|').append(a.lastModifiedTime().toMillis())
                      .append('|').append(a.size()).append('\n');
                } catch (IOException e) {
                    // Raced away between listing and stat — skip it rather than fail the page.
                }
            }
        }
        return sb.toString();
    }

    private List<Path> listMarkdown(Path dir) {
        if (!Files.isDirectory(dir)) return List.of();
        List<Path> out = new ArrayList<>();
        try (DirectoryStream<Path> s = Files.newDirectoryStream(dir, "*.md")) {
            for (Path p : s) out.add(p);
        } catch (IOException e) {
            return List.of();
        }
        out.sort(Path::compareTo);
        return out;
    }

    private String read(Path p) {
        try {
            return Files.readString(p);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
