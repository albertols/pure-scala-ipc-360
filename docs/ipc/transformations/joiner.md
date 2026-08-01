# `joiner`

*This page exists in addition to the brief's eleven — see the note at the bottom for
why.*

## What IPC says

The Joiner is IPC's own transformation type (`<TRANSFORMATION TYPE="Joiner">`), joining
two input pipelines (Master and Detail) on a condition. IPC's own reference, cited by
`IPC-TYP-JOINER-001`:
[https://docs.informatica.com/data-integration/powercenter/10-4-0/transformation-guide/joiner-transformation/defining-a-join-condition.html](https://docs.informatica.com/data-integration/powercenter/10-4-0/transformation-guide/joiner-transformation/defining-a-join-condition.html).

This is the **source**-side kind — the joiner's joined *output*, read by whatever step
consumes it. Its input side is a different kind entirely: each of its two inputs is its
own `joinerInput` **target** step (`joinerInput.md`), named `<joiner>.MASTER`/
`<joiner>.DETAIL`. The two kinds' shapes don't overlap at all — `joiner` carries
`joinerTables`/`joinerType`/`joinerCondition` and no `fields[]`; `joinerInput` carries
`fields[]` and nothing else — which is why `ipc-rules.json` already gives them separate
`wikiRef` targets (`joiner.md` for `IPC-TYP-JOINER-001`, `joinerInput.md` for
`IPC-TYP-JOINERINPUT-001`) rather than one shared page.

## What the parser emits

`JoinerSource(name: String, `type`: String = "joiner", joinerTables: List[String],
joinerType: String, joinerCondition: String)` —
`parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractSource.scala:26-30`. Built by
`AbstractSourceFactory.createJoinerSource` (`AbstractSourceFactory.scala:75-82`):
`joinerTables` is always exactly `[s"$joinerName.MASTER", s"$joinerName.DETAIL"]` —
computed, not read from any XML attribute, and always matching the two `joinerInput`
target names this joiner also produces; `joinerType`/`joinerCondition` read the `"Join
Type"`/`"Join Condition"` `TABLEATTRIBUTE`s, defaulting to `""` when absent.

JSON keys: `name`, `type`, `joinerTables[]`, `joinerType`, `joinerCondition` — all four
required (`IPC-TYP-JOINER-001`, `rules.md#ipc-typ-joiner-001`). No `fields[]` — like
every source kind, connectivity flows via downstream dot-refs into the paired
`joinerInput` target steps.

## Recipe JSON shape

Verbatim, `DWH/m_DWH_MAPLEGROVE_ACT_CLIENTMGR_PROFILES/_ETL_m_DWH_MAPLEGROVE_ACT_CLIENTMGR_PROFILES.json:1504-1515`
— the joiner source itself is a `sources[]` entry of a step downstream of both its
`JNR_Ashshore.MASTER` and `JNR_Ashshore.DETAIL` `joinerInput` targets (that pairing is
`joinerInput.md`'s worked example):

```json
"sources" : [
  {
    "name" : "JNR_Ashshore",
    "type" : "joiner",
    "joinerTables" : [
      "JNR_Ashshore.MASTER",
      "JNR_Ashshore.DETAIL"
    ],
    "joinerType" : "Detail Outer Join",
    "joinerCondition" : "ID_MEMBER1 = ID_MEMBER"
  }
]
```

Note the bare `name: "JNR_Ashshore"` — this transformation's own instance name is never
a step target name in this recipe (only its `.MASTER`/`.DETAIL` `joinerInput` children
are); a downstream field referencing `JNR_Ashshore.<port>` directly is exactly the
`IPC-REF-003` corpus pattern (`rules.md#ipc-ref-003`).

## Corpus occurrences

**5** source occurrences. No anonymizer token — `joiner` survives as the literal string
in the committed corpus.

## Rules

- `IPC-TYP-JOINER-001` — must specify `joinerTables`, `joinerType` and
  `joinerCondition` (`rules.md#ipc-typ-joiner-001`).
- The structural family (`IPC-STR-001`–`009`) and referential family (`IPC-REF-001`–`006`,
  `rules.md`) apply — `IPC-REF-003`'s corpus evidence (`rules.md#ipc-ref-003`) is
  specifically about this kind's bare-name reference pattern (5 of its 15 joiner/union
  occurrences), and `IPC-FLW-001` (`rules.md#ipc-flw-001`) about its downstream
  reachability consequence.

---

**Why a twelfth page.** The brief's stated set is eleven pages (the ten `IpcVocabulary.TARGET_TYPES`
kinds plus `union`), matching `IpcRulesContractTest.everyKindHasAWikiPage`. But
`ipc-rules.json`'s `IPC-TYP-JOINER-001` entry — landed before this task, in Task 5's
referential-rules work — already points its `wikiRef` at `docs/ipc/transformations/joiner.md`,
a file distinct from `joinerInput.md`, and `IpcRulesContractTest.everyWikiRefResolvesToAFileThatExists`
enforces that every non-blank `wikiRef` resolves to a real file. `joiner` (source) and
`joinerInput` (target) are exactly the case the task brief flagged as a judgement call:
their target and source forms don't overlap in a single key, so one shared page would
be misleading in the same way `table.md` (target and source really do share `{name,
type, primaryKeys?}`) is not.
