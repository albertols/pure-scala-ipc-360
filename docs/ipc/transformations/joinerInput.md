# `joinerInput`

## What IPC says

`joinerInput` names one **side** (Master or Detail) of an IPC Joiner transformation's
two-input join. IPC's own reference is the Joiner Transformation overview, cited by
`IPC-TYP-JOINERINPUT-001`:
[https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/joiner-transformation/joiner-transformation-overview.html](https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/joiner-transformation/joiner-transformation-overview.html).
IPC itself has no transformation type named "Joiner Input" — like `unionInput`, this
kind is the parser's own per-side split of a single `<TRANSFORMATION TYPE="Joiner">`
(see the sibling, differently-shaped `joiner` **source** kind, `joiner.md`, and why the
two needed separate pages).

## What the parser emits

`JoinerTarget(name: String, `type`: String = "joinerInput", fields: List[Field])` —
`parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala:33-35`. Built by
`AbstractTargetFactory.createJoinerTarget` (`AbstractTargetFactory.scala:80-89`): the
target's `name` is synthesized, not read off any single XML attribute —
`s"${joiner.name}.$inputType"` where `inputType` is `Master` if the field's
`TRANSFORMFIELD@PORTTYPE` contains `"MASTER"`, else `Detail`
(`AbstractTargetFactory.scala:82-87`, the `.$inputType` concatenation itself at `:88`).
This is `IPC-TYP-JOINERINPUT-001`'s invariant: **every** `joinerInput` target name must
match `^.+\.(MASTER|DETAIL)$` (`rules.md#ipc-typ-joinerinput-001`). JSON keys: `name`,
`type`, `fields[]` only — no additional keys.

## Recipe JSON shape

Verbatim, `DWH/m_DWH_MAPLEGROVE_ACT_CLIENTMGR_PROFILES/_ETL_m_DWH_MAPLEGROVE_ACT_CLIENTMGR_PROFILES.json:1518-1535`,
truncated to the first two of many `fields[]` entries — the array and the enclosing
`target` object both continue past line 1535 in the real file. `type` survives here
under the anonymizer token `ASHPATH2` (`README.md`'s alias table); `name` is the real,
unaliased `<joiner>.DETAIL` string:

```json
"target" : {
  "name" : "JNR_Ashshore.DETAIL",
  "type" : "ASHPATH2",
  "fields" : [
    {
      "name" : "ID_MEMBER",
      "dataType" : "BigDecimal",
      "transformation" : { "source" : "SQ_DWH_LKP_DIR_MAILCODE.ID_MEMBER" }
    },
    {
      "name" : "DESC_LOCATION",
      "dataType" : "String",
      "transformation" : { "source" : "SQ_DWH_LKP_DIR_MAILCODE.DESC_LOCATION" }
    },
    "…"
  ]
}
```

## Corpus occurrences

**10** target occurrences, always under the anonymizer token `ASHPATH2` in this corpus
(`IpcVocabulary.TYPE_ALIASES`) — the canonical string `joinerInput` never appears
literally as a `type` value in the committed JSON.

## Rules

- `IPC-TYP-JOINERINPUT-001` — target name must be `<joiner>.MASTER` or
  `<joiner>.DETAIL` (`rules.md#ipc-typ-joinerinput-001`).
- The structural family (`IPC-STR-001`–`009`) and referential family (`IPC-REF-001`–`006`,
  `rules.md`) apply.
