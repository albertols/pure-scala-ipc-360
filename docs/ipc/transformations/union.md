# `union`

## What IPC says

The Union is IPC's own transformation type, exposed in the XML as a
`<TRANSFORMATION TYPE="Custom Transformation">` whose `TEMPLATENAME` attribute is
`"Union Transformation"` (`RecipeConstants.UnionTransformation`, `RecipeConstants.scala:24`
— the same "Custom Transformation" wrapper the `java` kind uses with a different
`TEMPLATENAME`, `java.md`), merging data from multiple input groups into one output.
IPC's own reference, cited by `IPC-TYP-UNION-001`:
[https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/union-transformation/working-with-groups-and-ports.html](https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/union-transformation/working-with-groups-and-ports.html).

This is the **source**-side kind — the union transformation's *output*, read by
whatever step consumes it. Its input side is a different kind entirely: each input
group is its own `unionInput` **target** step (`unionInput.md`), which is why this
corpus caveat exists — see that page for why the two needed separate pages rather than
one shared "union" page the way `table` is shared.

## What the parser emits

`UnionSource(name: String, `type`: String = "union", unionTables: List[UnionTable])` —
`parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractSource.scala:8-10`, where
`UnionTable(name: String, fieldMapping: List[FieldMap])` is `AbstractSource.scala:12`
and `FieldMap(origin: String, union: String)` is `AbstractSource.scala:14`. Built by
`AbstractSourceFactory.createUnionSource` (`AbstractSourceFactory.scala:45-68`): keeps
only `GROUP@TYPE` values equal to `"INPUT"` (`.filter(_.\`type\` == Input)`, `:49`) as the
`unionTables[].name` entries, and for each one maps every `TRANSFORMFIELD@GROUP`-matching
field's own name (`origin`) to whatever field the union's internal field-dependency graph
says it feeds (`union`) — falling back to the origin name itself when no dependency
entry exists (`:57-63`).

JSON keys: `name`, `type`, `unionTables[]` (required — `IPC-TYP-UNION-001`,
`rules.md#ipc-typ-union-001`, which also requires every `fieldMapping[]` entry to carry
both `origin` and `union`). This kind has **no** `fields[]` — like every source kind,
connectivity flows the other direction, via downstream dot-refs into the paired
`unionInput` target steps.

## Recipe JSON shape

Verbatim, `DWH/m_DWH_E_LKP_DIR_PHONELIST/_ETL_m_DWH_E_LKP_DIR_PHONELIST.json:87-106`,
truncated to the first `unionTables[]` entry's first three `fieldMapping[]` entries — in
the real file, that entry's `fieldMapping[]` continues well past what's shown, and
`unionTables[]` itself has further entries after this one:

```json
"sources" : [
  {
    "name" : "Union",
    "type" : "union",
    "unionTables" : [
      {
        "name" : "MAPLEROAD301MAPLEHEATH",
        "fieldMapping" : [
          { "origin" : "ID_LOCATION1", "union" : "ID_LOCATION" },
          { "origin" : "ID_MEMBER1", "union" : "ID_MEMBER" },
          { "origin" : "NUM_ELMCROFT_OAKHOLLOW1", "union" : "NUM_ELMCROFT_OAKHOLLOW" },
          "…"
        ]
      },
      "…"
    ]
  }
]
```

Note the bare `name: "Union"` here — this transformation's own instance name is never a
step target name in this recipe (only its per-group `unionInput` children are); a
downstream field referencing `Union.<port>` directly is exactly the `IPC-REF-003`
corpus pattern (`rules.md#ipc-ref-003`).

## Corpus occurrences

**10** source occurrences. No anonymizer token — `union` survives as the literal string
in the committed corpus.

## Rules

- `IPC-TYP-UNION-001` — must specify `unionTables`, every `fieldMapping[]` entry
  carrying both `origin` and `union` (`rules.md#ipc-typ-union-001`).
- The structural family (`IPC-STR-001`–`009`) and referential family (`IPC-REF-001`–`006`,
  `rules.md`) apply — `IPC-REF-003`'s corpus evidence (`rules.md#ipc-ref-003`) is
  specifically about this kind's bare-name reference pattern, and `IPC-FLW-001`
  (`rules.md#ipc-flw-001`) about its downstream reachability consequence.
