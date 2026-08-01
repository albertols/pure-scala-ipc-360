package io.pure360.etl360.api;

import io.pure360.etl360.api.dto.IpcConnectionDto;
import io.pure360.etl360.api.dto.IpcKeySpecDto;
import io.pure360.etl360.api.dto.IpcRuleMetaDto;
import io.pure360.etl360.api.dto.IpcRulesDto;
import io.pure360.etl360.service.ipc.IpcCatalog;
import org.springframework.web.bind.annotation.GetMapping;
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

    public IpcController(IpcCatalog catalog) { this.catalog = catalog; }

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
        Map<String, IpcConnectionDto> connections = new LinkedHashMap<>();
        catalog.connections().forEach((kind, rule) -> connections.put(kind, new IpcConnectionDto(
            rule.sourceKind(), rule.mayFeed(), rule.exactly(), rule.namedInputs(), rule.active())));
        return new IpcRulesDto(rules, catalog.typeAliases(), catalog.keyAliases(), schema, connections);
    }
}
