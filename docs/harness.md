# Harness

How Claude-driven work on this repo is structured: the skills that encode
repo-specific procedure, the subagents that carry out and review plan tasks, how a
sub-project's loop layers, how the test gates compose, and the checklist for starting
the next one. This is the map; `.claude/skills/*/SKILL.md` and `.claude/agents/*.md`
are the executable detail.

## Skills

| Skill | Use when |
|---|---|
| [`regen-corpus`](../.claude/skills/regen-corpus/SKILL.md) | Regenerating, re-running, or verifying the parser against the IPC XML corpus — always via `make regen-corpus`, never in place. |
| [`run-app`](../.claude/skills/run-app/SKILL.md) | Running, starting, or health-checking the ETL 360 suite locally (backend + frontend). |
| [`validate-loop`](../.claude/skills/validate-loop/SKILL.md) | Running the end-to-end validation gate over the mock operational data. |
| `mock-etl-data` | Regenerating the synthetic CAS/SYN mock operational data safely (authored by the synthetic-data stream; not duplicated here). |
| [`sdd-cycle`](../.claude/skills/sdd-cycle/SKILL.md) | Starting, resuming, or reviewing an ETL 360 sub-project end to end — brainstorm to merged branch. |
| [`tab-rewire`](../.claude/skills/tab-rewire/SKILL.md) | Converting a mock-fed frontend tab to real backend data, or adding its corpus-wide render gate. |

## Subagents

- **`implementer`** (`.claude/agents/implementer.md`) — given the FULL text of one
  plan task (never a summary), does the task's TDD cycle in the named worktree and
  commits with the plan's exact message. Report contract: task name, changed-file
  list, RED evidence, GREEN evidence, verification tail, deviations (or "none"),
  commit hash.
- **`task-reviewer`** (`.claude/agents/task-reviewer.md`) — read-only; checks the
  implementer's commit(s) against the same brief for fidelity, TDD honesty, hard-rule
  compliance, and quality, citing `file:line`. Verdict `APPROVE` or `FIX`, with
  blocking findings numbered and evidenced.
- **Fix-loop**: `implementer` → `task-reviewer`; on `FIX`, re-dispatch `implementer`
  with the blocking findings appended; repeat until `APPROVE` before the next task
  starts.

## Loop layering

Within a plan, tasks are ordered so nothing is built on a contract that doesn't exist
yet: **functional prerequisites** (fixtures, corpus, schema) → **data/mock layer**
(synthetic or mirrored data a real backend can serve) → **backend/middleware**
(controllers, DTOs, services) → **GUI** (adapter, then component rewire) →
**gates/docs** (sweep wiring, harness/architecture updates). Never GUI before its
data contract exists; never a gate before the thing it gates is real.

Worked examples, sub-projects 1–5:

1. **Foundation** — module move, corpus contract test, `make dev`/`make test` shape.
   Everything else stands on this.
2. **Synthetic operational data** — the data/mock layer: `SYN`-marked mappings, mock
   `LayerToLayerConfig`, generated b15 history, feeding `/api/operational/*`.
3. **IPC ETL Viewer** — Tab 1 real: adapter → fixtures → TDD → component rewire →
   sweep, the `tab-rewire` recipe's origin.
4. **ETL Modifier** — same recipe applied to Tab 2, plus the mock composer tier
   (ADR-0003).
5. **Operational casuistics** — deeper operational-history cases layered on
   sub-project 2's data, no new UI surface.

## How the gates compose

- **`make test`** = `mvn -q -am -pl backend test` (parser + backend, full reactor) +
  `cd frontend && pnpm test` (vitest). Proves units and components in isolation.
- **`make check`** = `make test` + `npx tsc --noEmit` + `pnpm format --check`
  (advisory while the format backlog documented in the root `README.md` stands).
  Proves the frontend type-checks and stays on the formatting trajectory.
- **`make validate-loop`** (`scripts/validate_loop.sh`) = boots the real backend,
  curls `/api/health`, `/api/relationships`, `/api/operational/dates`/`{date}` over
  the committed synthetic mock data, runs every corpus-wide render sweep (viewer
  today; each `tab-rewire` adds its own `scripts/<x>_sweep.mts` here, never beside
  it), then runs the frontend hook tests. Proves the whole loop — frontend through
  middleware to a live backend — not just each layer's own tests.

Run them in that order: cheapest/most local first, most expensive/most end-to-end
last, so a broken unit fails fast instead of burning a full backend boot.

## Starting a new sub-project

1. Brainstorm (`superpowers:brainstorming`), then write the spec:
   `docs/superpowers/specs/YYYY-MM-DD-<name>-design.md`.
2. Write the plan (`superpowers:writing-plans`):
   `docs/superpowers/plans/YYYY-MM-DD-<name>.md`, real code per task, no placeholders.
3. Create the worktree/branch (`superpowers:using-git-worktrees`):
   `.worktrees/<name>`, `feat/etl360-<name>`. Parallel streams fork from `main` only
   after shared foundations have merged.
4. Run `sdd-cycle` per task: `implementer` → `task-reviewer` fix-loop until `APPROVE`.
5. Acceptance walk: re-verify every spec criterion PASS/FAIL with evidence
   (`superpowers:verification-before-completion`).
6. Merge (`superpowers:finishing-a-development-branch`). Root-level doc edits
   (`CLAUDE.md`, root `README.md`) are single-owner and land LAST, after every
   parallel stream's own docs are in.

See `docs/visual-guide.md` for the harness-loop diagram (outer loop, inner loop, and
gate sequencing pictured, not duplicated here).
