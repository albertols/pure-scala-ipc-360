# ADR-0005: Figma visual contract is hard, not advisory

**Status:** Accepted

## Context

`frontend/` originates from a Figma Make prototype: dark theme tokens in `src/index.css`, Inter/JetBrains Mono, four-tab layout, specific interactions. Foundation's job is to replace `mockData.ts` with real backend data, starting with the sidebar tree — a task that invites "while I'm in here" restyling.

## Decision

The prototype's visual look is a **hard contract**: rewiring swaps data sources only. No restyling, spacing, color, or interaction changes without an explicit ask, even for new states (loading/error) — those reuse existing tokens (`--text-dim` for loading, `--red` for errors). Backend DTOs are shaped to fit the frontend's existing `types.ts` contracts, not the other way around.

## Consequences

- Every Foundation frontend task (real tree, API layer) has an explicit visual-verification step distinct from its functional tests.
- New corpus layers absent from the original mock (DWH, ETL, QDM, RDM, STG) get colors added to `Sidebar.tsx`'s `LAYER_COLORS` using existing CSS custom properties only — data completeness, not a restyle.
- Acceptance criterion 7 (spec §11) is a side-by-side visual diff against `main`, treated as a release gate alongside functional tests.

## Alternatives considered

- **Restyle opportunistically while wiring data** — faster short-term, but breaks the prototype's design sign-off and makes visual regressions untraceable.
- **Freeze `frontend/` entirely until a dedicated redesign phase** — safest for the contract, but blocks all real-data wiring for the whole Foundation phase.
