package io.pure360.etl360.api;

import io.pure360.etl360.service.support.InvalidCorpusPathException;
import io.pure360.etl360.service.support.NotFoundException;
import io.pure360.etl360.service.support.UnreadableFileException;
import io.pure360.etl360.service.support.XmlUnparsableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.UUID;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(NotFoundException.class)
    ProblemDetail notFound(NotFoundException e) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
        pd.setTitle("Not found");
        return pd;
    }

    @ExceptionHandler(InvalidCorpusPathException.class)
    ProblemDetail badPath(InvalidCorpusPathException e) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
        pd.setTitle("Invalid path");
        return pd;
    }

    @ExceptionHandler(XmlUnparsableException.class)
    ProblemDetail unparsable(XmlUnparsableException e) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY, e.getMessage());
        pd.setTitle("XML unparsable");
        return pd;
    }

    @ExceptionHandler(UnreadableFileException.class)
    ProblemDetail unreadable(UnreadableFileException e) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY, e.getMessage());
        pd.setTitle("File unreadable");
        return pd;
    }

    // Catch-all per spec §6: any exception not mapped above (UncheckedIOException,
    // IllegalStateException, TOCTOU races, ...) must not leak Spring's default error body
    // or a stack trace to the client. Logged server-side with a correlation id that's also
    // returned to the caller so a report can be matched back to the server log.
    @ExceptionHandler(Exception.class)
    ProblemDetail internalError(Exception e) {
        String correlationId = UUID.randomUUID().toString();
        log.error("Unhandled exception [correlationId={}]", correlationId, e);
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR,
            "An unexpected error occurred. Reference id: " + correlationId);
        pd.setTitle("Internal error");
        pd.setProperty("correlationId", correlationId);
        return pd;
    }
}
