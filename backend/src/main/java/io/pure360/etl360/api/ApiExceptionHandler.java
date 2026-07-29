package io.pure360.etl360.api;

import io.pure360.etl360.service.support.InvalidCorpusPathException;
import io.pure360.etl360.service.support.NotFoundException;
import io.pure360.etl360.service.support.XmlUnparsableException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
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
}
