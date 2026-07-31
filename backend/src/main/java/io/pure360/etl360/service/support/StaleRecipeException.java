package io.pure360.etl360.service.support;

/** Thrown when a recipe {@code PUT}'s {@code baseModified} no longer matches the file on disk —
 * someone else (or another tab) saved a newer version first. Maps to 409 Conflict. */
public class StaleRecipeException extends RuntimeException {
    public StaleRecipeException(String detail) { super(detail); }
}
