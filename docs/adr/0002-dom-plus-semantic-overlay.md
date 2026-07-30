# ADR-0002: XML fidelity via generic DOM + semantic overlay

**Status:** Accepted

## Context

The Viewer needs full-fidelity access to every element/attribute in a Powermart XML (nothing hidden), while other consumers (Modifier, expressions archive) need a typed, navigable model. The parser's Scala case-class model covers only what recipe generation needs, not full XML coverage; extending it risks the production parser.

## Decision

Serve two views of the same file: `GET /api/mappings/dom/{*path}` — a lossless generic `{name, attributes, text?, children[]}` recursive JSON built directly from a DOM parse (no parser involvement); and `GET /api/mappings/model/{*path}` — the semantic model, produced by calling `XMLRoot.parsePowermart` in-JVM and mapping its case classes to DTOs.

## Consequences

- Viewer gets guaranteed full coverage from the DOM route; Modifier/expressions rely on the typed model route without either blocking the other's needs.
- Mixed-content element ordering (interleaved text and child elements) is **not** preserved in the DOM JSON — Powermart XML has no such elements in practice, so this is a documented non-issue, not a real fidelity gap.
- Semantic DTOs (`MappingModelDto` and nested records) mirror the parser's case classes in `parser/.../xmltojson/nodes/` **field-for-field**, same names, with one documented exception (`Folder.transformation` singular → `FolderDto.transformations` plural).

## Alternatives considered

- **Extend the Scala model to full XML coverage** — highest fidelity in one model, but high risk of silently missing elements in the production recipe-generation path.
- **Ship raw XML to the browser** — no backend transform needed, but duplicates Powermart semantics client-side and pushes a heavy parse onto every page load.
