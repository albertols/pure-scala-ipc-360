---
name: regen-corpus
description: Use when asked to regenerate, re-run, or verify the parser against the IPC XML corpus — always via make regen-corpus, never in place, and how to read the diff.
---

# regen-corpus

Thin wrapper over `make regen-corpus` (`scripts/regen_corpus.sh`). **Never** run the parser CLI directly against `parser/src/main/resources/xmltobq` — outputs write next to inputs and would overwrite the committed corpus.

## Run it

```bash
make regen-corpus
```
Copies XMLs (not generated JSON) to a temp dir, runs the parser CLI there with `--generateDDLContent --generateRecipe --generateTargetDDL --generateSourceDDL`, then `diff -r` against the committed corpus. Temp dir path is printed and left for inspection.

## Reading the diff

- **Expected noise:** committed recipe JSONs were anonymized *after* generation, including some JSON key names — regenerated output legitimately differs there.
- **Expected noise:** `CalciteSqlTranslator - Exception during SQL parsing` log lines are fallback noise on untranslatable Oracle SQL, not failures.
- **Real signal:** a missing/extra file or a structural JSON diff outside renamed keys — treat as a parser bug; check root `CLAUDE.md` corpus caveats first.
- Full corpus = 46 XMLs → ≥46 recipes/models; the automated version of this check is `CorpusContractTest` (`make test-backend`).
