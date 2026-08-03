package io.pure360.etl360.api.dto;

import java.util.List;

/**
 * The batched request body of {@code POST /api/ipc/fan-in}.
 *
 * <p>Batched rather than one call per candidate because each candidate carries its OWN
 * existing input group — a "feeds" candidate's group is the downstream step's
 * {@code sources[]}, which differs per candidate — so a whole picker cannot be answered by
 * a single (group, candidate) question. One request per dialog state, not per button.
 *
 * <p>{@code pairings} may be null or empty; the answer is then an empty verdict map, never
 * an error (this endpoint is a UI affordance, and a 4xx here would surface as a broken
 * dialog rather than as the missing information it is).
 */
public record FanInRequestDto(List<FanInPairingDto> pairings) {}
