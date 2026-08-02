package io.pure360.etl360.service.support;

/** Thrown by {@link io.pure360.etl360.service.RecipeService#create} when a file already exists at
 * the requested path — {@code create} never upserts (that is the whole reason it is a {@code POST}
 * that conflicts rather than a {@code PUT} that overwrites; see its javadoc). Maps to 409 Conflict. */
public class RecipeAlreadyExistsException extends RuntimeException {
    public RecipeAlreadyExistsException(String detail) { super(detail); }
}
