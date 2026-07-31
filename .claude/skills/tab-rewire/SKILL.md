---
name: tab-rewire
description: Use when converting a mock-fed ETL 360 frontend tab to real backend data, or adding a corpus-wide render gate for one — the adapter-first recipe proven on Tabs 1 and 2.
---

# tab-rewire — taking a mock tab real

1. **Adapter first.** Pure module `frontend/src/api/<x>Adapter.ts` mapping the DTO
   onto the EXISTING view types (`frontend/src/types.ts`) — `import type` only,
   relative runtime imports with explicit `.ts` extensions so
   `node --experimental-strip-types` can load it for sweeps. Never invent parallel types.
2. **Fixtures from the corpus.** Boot the backend, `curl` real payloads into
   `frontend/src/api/__fixtures__/*.json` (anonymized/SYN corpus data is committable).
3. **TDD the adapter** on fixtures: kinds, ports, edges (no dangling), finite layout,
   unknown-type 3-letter fallback, empty/unparseable input → empty output, never throw.
4. **Rewire the component:** swap the mock import for hooks + adapter; add
   loading/error/empty states from EXISTING tokens only. RTL+MSW proof: click a tree
   file → the real card renders.
5. **Sweep gate.** `scripts/<x>_sweep.mts` walks `/api/tree`, runs every corpus file
   through the adapter, asserts the floor (69 mappings / 74 recipes / 18 L2L); wire
   it into `scripts/validate_loop.sh`. A FAIL names the file: fix the adapter, never
   skip corpus entries.
6. **Retire the mock:** grep proves no other importer, delete the export, update the
   `mockData.ts` header ledger + `frontend/AGENTS.md`.

## Hard rules

- Figma visual contract (`docs/adr/0005`): data-source swap only; any sanctioned
  visual change must be listed in the spec BEFORE implementation.
- Dot-notation refs (`"TABLE.FIELD"`) are preserved verbatim — never normalize.
- New multi-render test files add `afterEach(() => cleanup())` — no global RTL cleanup here.
