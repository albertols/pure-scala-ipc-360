package io.pure360.etl360.service.support;

public class InvalidRequestException extends RuntimeException {
    public InvalidRequestException(String detail) { super(detail); }
}
