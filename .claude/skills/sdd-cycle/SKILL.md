---
name: sdd-cycle
description: Use when starting, resuming, or reviewing an ETL 360 sub-project — from brainstorm to merged branch, including where specs/plans live, the per-task loop, the checkbox/commit ledger, and the gates.
---

# sdd-cycle — how this repo ships a sub-project

## Outer loop

1. **Brainstorm → spec** (superpowers:brainstorming): write
   `docs/superpowers/specs/YYYY-MM-DD-<name>-design.md` — numbered sections, ground
   truth cited as `file:line`, explicit non-goals, acceptance criteria. User approves.
2. **Plan** (superpowers:writing-plans): `docs/superpowers/plans/YYYY-MM-DD-<name>.md`
   — header, Global Constraints, per-task Files/Interfaces/checkbox steps with REAL
   code, exact commit messages, explicit staged paths. No placeholders.
3. **Branch**: worktree `.worktrees/<name>`, branch `feat/etl360-<name>`
   (superpowers:using-git-worktrees). Parallel streams fork from main AFTER shared
   foundations merge; root CLAUDE.md/README edits are single-owner and go LAST.
4. **Per task**: dispatch the `implementer` agent with the FULL task brief, then
   `task-reviewer`; fix-loop until APPROVE
   (superpowers:subagent-driven-development).
5. **Gates**: `make test` → `make check` → `make validate-loop` (docs/harness.md
   explains what each proves). New sweeps get wired INTO validate-loop, not beside it.
6. **Acceptance walk**: the final task re-verifies every spec criterion, PASS/FAIL
   with evidence (superpowers:verification-before-completion).
7. **Merge** (superpowers:finishing-a-development-branch).

## Inner loop (every implementation task)

RED (failing test, output captured) → GREEN (minimal implementation) → verify
(frontend `cd frontend && pnpm test && npx tsc --noEmit`; backend
`mvn -q -am -pl backend test`) → commit. Task ordering across a plan layers:
functional prerequisites (data/fixtures/corpus) → backend/middleware → GUI →
gates/docs — never GUI before its data contract exists.

## Ledger & commit protocol

- Tick the plan's `- [ ]` checkboxes and stage the plan file IN the task's commit —
  commit history is the resumability record; resume = first unticked checkbox.
- Stage explicit paths only. NEVER `git add -A` (user-local untracked files exist).

## Model tiering

Spec, plan, and review deserve the strongest available model; mechanical tasks
(fixture capture, key renames, formatting) may run a cheaper tier — the brief carries
the design, not the model. Never tier the task-reviewer below the implementer.
