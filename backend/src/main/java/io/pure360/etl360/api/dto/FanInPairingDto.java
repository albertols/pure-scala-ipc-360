package io.pure360.etl360.api.dto;

import java.util.List;

/**
 * One "may this candidate join that input group?" question for
 * {@code POST /api/ipc/fan-in}.
 *
 * <p>{@code key} is the CALLER's own correlation id, echoed back verbatim in
 * {@link FanInVerdictsDto#verdicts()}. The pre-add dialog asks about two pickers at once
 * ("fed by" and "feeds") whose candidate names can collide, so the server never invents a
 * key from the payload — it hands back exactly what it was given.
 *
 * <p>{@code existingSourceKinds} is the group the candidate would JOIN, never including the
 * candidate itself. Both it and {@code candidateKind} are raw recipe {@code type} tokens;
 * the controller resolves anonymizer aliases ({@code IpcVocabulary.canonicalSourceType})
 * before classifying, so a caller never needs a second copy of the alias table.
 */
public record FanInPairingDto(String key, List<String> existingSourceKinds, String candidateKind) {}
