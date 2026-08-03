package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.FanInPairingDto;
import io.pure360.etl360.api.dto.FanInRequestDto;
import io.pure360.etl360.api.dto.FanInVerdictsDto;
import io.pure360.etl360.api.dto.IpcConnectionDto;
import io.pure360.etl360.api.dto.IpcKeySpecDto;
import io.pure360.etl360.api.dto.IpcRuleMetaDto;
import io.pure360.etl360.api.dto.IpcRulesDto;
import io.pure360.etl360.service.ipc.IpcCatalog;
import io.pure360.etl360.service.ipc.IpcConnections;
import io.pure360.etl360.service.ipc.IpcVocabulary;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Serves the IPC conformance catalogue so the GUI can explain a failing check and derive
 * the Inspector's per-kind key schema without hardcoding a second copy of the grammar. */
@RestController
@RequestMapping("/api/ipc")
public class IpcController {
    private final IpcCatalog catalog;
    private final IpcConnections connections;

    public IpcController(IpcCatalog catalog, IpcConnections connections) {
        this.catalog = catalog;
        this.connections = connections;
    }

    @GetMapping("/rules")
    public IpcRulesDto rules() {
        List<IpcRuleMetaDto> rules = catalog.rules().stream()
            .map(m -> new IpcRuleMetaDto(m.id(), m.severity(), m.statement(),
                m.parserRef(), m.ipcRef(), m.wikiRef()))
            .toList();
        Map<String, List<IpcKeySpecDto>> schema = new LinkedHashMap<>();
        catalog.keySchema().forEach((kind, specs) -> schema.put(kind, specs.stream()
            .map(s -> new IpcKeySpecDto(s.key(), s.parserType(), s.required(), s.widget(), s.ruleId()))
            .toList()));
        Map<String, IpcConnectionDto> connectionDtos = new LinkedHashMap<>();
        catalog.connections().forEach((kind, rule) -> connectionDtos.put(kind, new IpcConnectionDto(
            rule.sourceKind(), rule.mayFeed(), rule.exactly(), rule.namedInputs(), rule.active())));
        return new IpcRulesDto(rules, catalog.typeAliases(), catalog.keyAliases(), schema, connectionDtos);
    }

    /**
     * The fan-in constraint pairwise {@code mayFeed} adjacency cannot express — a downstream
     * input group takes either any number of passive inputs, or exactly one active input and
     * nothing else — evaluated for a batch of candidate connections
     * ({@link IpcConnections#fanInVerdict}).
     *
     * <p>Server-side on purpose (final whole-branch review, BLOCKING 3): the rule keeps ONE
     * implementation, the way {@code ipcRules.ts}'s standing ruling keeps the conformance
     * catalogue out of a second TypeScript mirror. A client-side reimplementation would have
     * left {@code fanInVerdict} exactly as it was — computed, tested, and called by nothing.
     *
     * <p>Raw recipe {@code type} tokens are canonicalized here before classification, so a
     * step carrying an anonymizer alias ({@code BERYLFALLS} -> {@code sourceQualifier})
     * classifies identically to the corpus sweep in {@code IpcConnectionsContractTest}, and
     * the GUI never needs a copy of the alias table to ask the question. An unknown token
     * resolves to itself, finds no rule, and lands on {@code "warn"} — never {@code "block"}.
     *
     * <p>A missing/empty {@code pairings} answers with an empty map rather than a 4xx: this
     * endpoint is a UI affordance, and the caller degrades by NOT constraining anything.
     */
    @PostMapping("/fan-in")
    public FanInVerdictsDto fanIn(@RequestBody FanInRequestDto request) {
        Map<String, String> verdicts = new LinkedHashMap<>();
        List<FanInPairingDto> pairings = request == null || request.pairings() == null
            ? List.of() : request.pairings();
        for (FanInPairingDto p : pairings) {
            if (p == null || p.key() == null) continue;
            List<String> existing = (p.existingSourceKinds() == null ? List.<String>of() : p.existingSourceKinds())
                .stream().map(IpcVocabulary::canonicalSourceType).toList();
            verdicts.put(p.key(),
                connections.fanInVerdict(existing, IpcVocabulary.canonicalSourceType(p.candidateKind())));
        }
        return new FanInVerdictsDto(verdicts);
    }
}
