package io.pure360.etl360.config;

import java.nio.file.Files;
import java.nio.file.Path;

public final class RepoRoot {
    private RepoRoot() {}

    public static Path resolve(Path startDir) {
        Path dir = startDir.toAbsolutePath().normalize();
        while (dir != null) {
            if (Files.exists(dir.resolve("pom.xml")) && Files.isDirectory(dir.resolve("parser"))) {
                return dir;
            }
            dir = dir.getParent();
        }
        throw new IllegalStateException("Repo root (pom.xml + parser/) not found above " + startDir);
    }
}
