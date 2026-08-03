package io.pure360.etl360.api.dto;

import java.util.Map;

/**
 * The answer to {@link FanInRequestDto}: the caller's own {@code key} mapped to one of
 * {@code "ok"} / {@code "warn"} / {@code "block"}, straight from
 * {@code IpcConnections.fanInVerdict}.
 *
 * <p>Three-valued deliberately. {@code "block"} asserts we KNOW the link is illegal and is
 * the only value a caller may refuse a connection on; {@code "warn"} means "cannot be
 * determined" (a participant whose {@code active} classification is null — {@code table},
 * {@code java}, {@code joinerInput}, or any kind absent from the matrix) and must be
 * surfaced without blocking. Collapsing the two would refuse links we cannot prove illegal,
 * which the rule's own contract calls worse than permitting links we cannot prove legal.
 */
public record FanInVerdictsDto(Map<String, String> verdicts) {}
