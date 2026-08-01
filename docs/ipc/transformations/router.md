# `router`

## What IPC says

The Router is IPC's own transformation type (`<TRANSFORMATION TYPE="Router">`), testing
each row against every group's filter condition and routing it to all groups whose
condition is true, plus an optional default group for rows matching none. IPC's own
references, cited by the three rules below: adding groups —
[https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/router-transformation/working-with-groups/adding-groups.html](https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/router-transformation/working-with-groups/adding-groups.html)
— and the default group —
[https://docs.informatica.com/data-integration/powercenter/10-4-0/transformation-guide/router-transformation/working-with-groups/output-groups/the-default-group.html](https://docs.informatica.com/data-integration/powercenter/10-4-0/transformation-guide/router-transformation/working-with-groups/output-groups/the-default-group.html).

## What the parser emits

- **Target**: `RouterTarget(name: String, `type`: String = "router", groups:
  List[RouterGroup], fields: List[Field])` —
  `parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala:42-45`, where
  `RouterGroup(name: String, filterCondition: Option[String] = None, default: Boolean =
  false, fields: List[Field])` is `AbstractTarget.scala:47`. Built by
  `AbstractTargetFactory.createRouterTarget` (`AbstractTargetFactory.scala:104-131`):
  keeps only `GROUP@TYPE` values containing `"Output"` (`.filter(_.\`type\`.contains(Output))`,
  `:107`), and for each surviving group collects its `Output`-typed
  `TRANSFORMFIELD`s whose `GROUP` matches (`:109-112`), building each field's
  transformation as a dot-ref to `router.name` + that field's `REF_FIELD` attribute
  (`:117`).
- **Source**: `RouterSource(name: String, `type`: String = "router", group: String)` —
  `parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractSource.scala:35-37`. `group`
  is the upstream output group name a downstream step reads from
  (`AbstractSourceFactory.createRouterSource`, `AbstractSourceFactory.scala:87-90`, reading
  the `INSTANCE@DESCRIPTION` attribute — the one router source key not sourced from a
  `TABLEATTRIBUTE`).

JSON keys: `name`, `type`, `fields[]` (target only), `groups[]` (target-only, required —
`IPC-TYP-ROUTER-001`, surviving in this corpus under the anonymizer key `greencliff`,
see `README.md`'s alias table), `group` (source-only, required — `IPC-TYP-ROUTER-003`).
Each `groups[]` entry is `{ name, filterCondition?, default, fields }`.

## Recipe JSON shape

Verbatim, `ETL/m_DWH_E_MAPLEGROVE_DEALFLOW_MIS_GCP1/_ETL_m_DWH_E_MAPLEGROVE_DEALFLOW_MIS_GCP1.json:24210-24225`
(target, `greencliff[0]` — the non-default `MAPLEGLADE` group, truncated to its first
`fields[]` entry; in the real file this group has many more fields, and `greencliff[]`
itself has 14 entries total, not the 2 shown) and `:24508-24518` (`greencliff[1]`, the
same file's `default: true` group, likewise truncated to its first field) — the
`groups` key survives here under the anonymizer token `greencliff`:

```json
"target" : {
  "name" : "RTR_CIPHERKEY_OFFERING",
  "type" : "router",
  "greencliff" : [
    {
      "name" : "MAPLEGLADE",
      "filterCondition" : "ID_CIPHERKEY_OFFERING='MAPLEGLADE'",
      "default" : false,
      "fields" : [
        {
          "name" : "ID_DEALFLOW1",
          "dataType" : "String",
          "transformation" : { "source" : "RTR_CIPHERKEY_OFFERING.ID_DEALFLOW" }
        },
        "…"
      ]
    },
    "…",
    {
      "name" : "DEFAULT1",
      "default" : true,
      "fields" : [
        {
          "name" : "ID_DEALFLOW2",
          "dataType" : "String",
          "transformation" : { "source" : "RTR_CIPHERKEY_OFFERING.ID_DEALFLOW" }
        },
        "…"
      ]
    }
  ]
}
```

A router source, from the same file, the full `sources[]` entry
(`:9059-9065`):

```json
"sources" : [
  { "name" : "RTR_CIPHERKEY_OFFERING", "type" : "router", "group" : "PM" }
]
```

## Corpus occurrences

**1** target occurrence (`RTR_CIPHERKEY_OFFERING`, `ETL/m_DWH_E_MAPLEGROVE_DEALFLOW_MIS_GCP1`
— its `greencliff` array has 14 entries, exactly one `default: true`, which is why the
corpus already satisfies `IPC-TYP-ROUTER-002` on real data), **14** source occurrences.
The target's `groups` key survives under the anonymizer token `greencliff`; `type`
itself is not aliased for this kind — the literal string `"router"` appears on both
sides.

## Rules

- `IPC-TYP-ROUTER-001` — target must specify `groups` as an array of `RouterGroup`
  (`rules.md#ipc-typ-router-001`).
- `IPC-TYP-ROUTER-002` — at most one group may carry `default: true`
  (`rules.md#ipc-typ-router-002`).
- `IPC-TYP-ROUTER-003` — source must specify `group`
  (`rules.md#ipc-typ-router-003`).
- The structural family (`IPC-STR-001`–`009`) and referential family (`IPC-REF-001`–`006`,
  `rules.md`) apply — `IPC-REF-002`'s router-namespace resolution
  (`rules.md#ipc-ref-002`) is specifically about this kind's group-qualified
  `<group>.<port>` downstream references.
