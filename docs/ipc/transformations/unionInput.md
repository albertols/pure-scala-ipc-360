# `unionInput`

## What IPC says

`unionInput` names one **input group** of an IPC Union transformation. IPC itself has
no separate transformation type called "Union Input" — this kind is the parser's own
per-group split of a single Union transformation's input side (see "What the parser
emits" below). The closest IPC reference is the Union Transformation guide's groups/
ports page, already cited by `IPC-TYP-UNION-001` for the sibling `union` **source**
kind: [https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/union-transformation/working-with-groups-and-ports.html](https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/union-transformation/working-with-groups-and-ports.html).
The rule catalogue carries no dedicated `ipcRef` for `unionInput` itself.

## What the parser emits

`UnionInputTarget(name: String, `type`: String = "unionInput", fields: List[Field])` —
`parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala:16-18`. Built by
`AbstractTargetFactory.createUnionTarget`
(`parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/transformation/AbstractTargetFactory.scala:51-55`):
`inputGroup = union.transformFields.find(_.name == fields.head.name).map(_.group)` — the
target's `name` is read off `TRANSFORMFIELD@GROUP` (`Transformation.scala:68`), **not**
`TRANSFORMATION@NAME`. That is the single most important fact about this kind: a
`unionInput` step target is named after an IPC **input group**
(`<GROUP NAME="..." TYPE="INPUT">`), a different XML entity from the transformation
itself — see the `EARLYGLADE` witness in `README.md`, where
`LKP_CEDARMOOR_NETHUB_ELMYARD` names a `<GROUP TYPE="INPUT">`, not a
`<TRANSFORMATION>`. JSON keys: `name`, `type`, `fields[]` only — no additional keys
(unlike `table`, there is no `primaryKeys`/`updateOverride`).

## Recipe JSON shape

Verbatim, `CDM/m_DM_LKP_CONTACTREF_MEMBER_NETHUB_PAIR/_ETL_m_DM_LKP_CONTACTREF_MEMBER_NETHUB_PAIR.json:521-538`
(`type` survives here under the anonymizer token `EARLYGLADE` — see `README.md`'s alias
table):

```json
"target" : {
  "name" : "LKP_CEDARMOOR_NETHUB_ELMYARD",
  "type" : "EARLYGLADE",
  "fields" : [
    {
      "name" : "ID_BIRCHCROSS_NETHUB6",
      "dataType" : "BigDecimal",
      "transformation" : { "source" : "SQ_LKP_CEDARMOOR_NETHUB_ELMYARD.ID_BIRCHCROSS_NETHUB" }
    },
    {
      "name" : "DESC_HAZELFIELD_NETHUB6",
      "dataType" : "String",
      "transformation" : { "source" : "SQ_LKP_CEDARMOOR_NETHUB_ELMYARD.DESC_HAZELFIELD_NETHUB" }
    }
  ]
}
```

Note the numeric disambiguation suffix on every field name (`...NETHUB6`) — this step is
one paired half of a connected-Lookup encoding also discussed in `IPC-REF-002` and
`IPC-REF-006` (`rules.md`); the suffix distinguishes this Lookup instance's ports from
another instance of the same underlying fields elsewhere in the same recipe.

## Corpus occurrences

**49** target occurrences, always under the anonymizer token `EARLYGLADE` in this
corpus (`IpcVocabulary.TYPE_ALIASES`, `README.md`'s alias table) — the canonical string
`unionInput` never appears literally in the committed JSON, only as the alias-resolved
kind after `IpcVocabulary.canonicalTargetType` runs.

## Rules

No `IPC-TYP-UNIONINPUT-*` id exists — `target:unionInput`'s key schema entries carry no
`ruleId` (`ipc-rules.json`), so a missing required key would surface only under
`IPC-TYP-REQUIRED-KEYS` (`rules.md#ipc-typ-required-keys`). The structural family
(`IPC-STR-001`–`009`) and referential family (`IPC-REF-001`–`006`, `rules.md`) apply —
in particular `IPC-REF-002` (`rules.md#ipc-ref-002`) and `IPC-REF-006`
(`rules.md#ipc-ref-006`), whose corpus evidence is specifically about this kind's role
in the paired-Lookup encoding shown above.
