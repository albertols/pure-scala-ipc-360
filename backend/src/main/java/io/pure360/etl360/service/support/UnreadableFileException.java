package io.pure360.etl360.service.support;

public class UnreadableFileException extends RuntimeException {
    public UnreadableFileException(String detail) { super(detail); }
}
