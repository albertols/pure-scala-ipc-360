# ADR-0010: IPC conformance ruleset

**Status:** Accepted

## Context

Tab 2 needed a way to tell the operator whether a recipe is IPC-legal. The old
`RecipeService.validate` covered four ad hoc checks and had already downgraded "type
known" to "non-blank" because the anonymizer corrupts `type` tokens corpus-wide. A real
ruleset needed full coverage of the parser's 20 kinds, severity that reflects reality
rather than either failing the whole corpus or staying permanently loose, trustworthy
documentation, and a way to cite PowerCenter docs without vendoring copyrighted material
(`docs.informatica.com` returns HTTP 403 to direct fetches, verified 2026-08-01).

## Decision

Split three ways, bound by a contract test: **logic in Java**
(`backend/.../service/ipc/`, one class per family — STR/TYP/REF/FLW/EXP — assembled by
`IpcRuleEngine`); **metadata in JSON** (`ipc-rules.json`: id, severity, statement,
`parserRef`, `ipcRef`, `wikiRef`, key schema, alias table); **prose in `docs/ipc/`**.
`IpcRulesContractTest` asserts the three never drift apart (every Java id has a
catalogue entry, every catalogue entry is documented, every `wikiRef` resolves), plus a
fourth leg for the function vocabulary specifically: exact set equality between the Java
copy and `RecipeConstants.scala`, not just cardinality.

**Severity is assigned empirically.** Run all 35 rules over all 86 corpus recipes; zero
violations ships `error`, any violation ships `warning` with the count and cause
recorded in `ipc-rules.json`. Contract-tested invariant: **every corpus recipe validates
with zero errors**. Result: 31 error / 4 warning (`IPC-REF-002`, `IPC-REF-003`,
`IPC-REF-006`, `IPC-FLW-001`).

Two rules looked like downgrade candidates and were **fixed instead** — the durable
lesson this ADR records. `IPC-EXP-001` flagged 569 "unknown" call names, all actually
unmodelled vocabulary (Lookup nodes, parser markers); completing it drove violations to
zero, so it ships `error`. `IPC-REF-002` flagged 1096 unresolved field-half dot-refs,
mostly a field-vocabulary gap (router/normalizer/storedProcedure namespaces); completing
it took the count to 28, but those 28 are parser-level data loss — names that never
reach the JSON at all — so it stays `warning` for a reason no more rule logic can close.
**"The corpus is loose" earns a downgrade; "the rule is wrong" earns a fix** — only
completing each rule's logic told the two apart.

**The alias table is display/validation only** (`IpcVocabulary`): four `type` tokens and
one structural key are anonymizer output, resolved for rule evaluation and canvas labels
but never rewritten on disk. Every mapping is confirmed against a source-XML witness
(three against `TRANSFORMATION@TYPE`, `EARLYGLADE` against `GROUP@NAME` since
union-input steps are named after IPC input groups, not transformations) and
re-asserted by `AliasWitnessContractTest`.

**Provenance: cite, don't vendor.** Every IPC-sourced rule carries an `ipcRef` URL;
`powrmart.dtd` and the guides are never copied in. The wiki's element inventory is
derived from the 81 corpus XMLs, not the DTD. Where IPC docs and the parser disagree,
the wiki records both but the ruleset follows the parser.

## Consequences

- A rule id drifting between Java/JSON/wiki fails a test, not a review guess; severity
  is reproducible by re-running the catalogue, not tribal knowledge.
- `docs/ipc/` stays a citation index, safe to keep public.
- The 4 warning families keep emitting until the parser stops discarding the residual
  names, or the union/joiner canvas-node gap (spec §13) closes the referential source.

## Alternatives considered

- **Declarative rule format (e.g. JSONLogic) instead of Java** — rejected; referential/
  dataflow checks need real graph algorithms (cycles, reachability).
- **Patch corpus data to keep "known type" an error** — rejected; CLAUDE.md hard rule 2
  forbids "fixing" anonymized data, and the alias table solves the real problem.
- **Vendor `powrmart.dtd`** — rejected; copyrighted, and the corpus-derived inventory is
  more accurate for this tool anyway.

---
*MADR-lite: keep each ADR ≤ 30 lines. One decision per file. Number sequentially;
never renumber or delete a filed ADR — mark it Superseded instead.*
