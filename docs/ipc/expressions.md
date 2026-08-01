# Expressions — the `EXP_*` call-tree grammar

Every field's `transformation` value is a `RecipeTransformation`
(`parser/src/main/scala/io/pure360/ipc/model/recipe/RecipeTransformation.scala:6-22`), a
sealed trait with exactly four cases. This page covers the shape of each, the
`PredefinedFunctions`/operator vocabulary the `IPC-EXP-*` rule family (`rules.md`)
validates against, and the formula-rendering contract the frontend and (per
`IpcRulesContractTest`'s comment) a future backend registry must both reproduce
byte-identically.

## The four-way union

```scala
sealed trait RecipeTransformation

case class RecipeTransformationExpression (name: String,
                                           parameters: Option[List[RecipeTransformation]] = None) extends RecipeTransformation

case class RecipeTransformationSource (source: String) extends RecipeTransformation

case class RecipeTransformationValue (value: String) extends RecipeTransformation

case class RecipeTransformationLookup (name: String = "EXP_LOOKUP",
                                       outputField: String,
                                       table: Option[String] = None,
                                       condition: Option[String] = None,
                                       sourceFilter: Option[String] = None,
                                       sqlOverride: Option[String] = None,
                                       matchPolicy: LookupMatchType.Value,
                                       parameters: List[Field]) extends RecipeTransformation
```
(`RecipeTransformation.scala:6-22`, quoted verbatim.)

Each case discriminates on which of `name+parameters?` / `source` / `value` /
`name+outputField+...` keys the JSON object carries — there is no explicit `type`
discriminator field on a transformation node the way there is on a step target/source.

### `{ name, parameters? }` — call tree (`RecipeTransformationExpression`, `:8`)

A nested function/operator call. `name` is either an `EXP_*` marker the parser itself
emits (`IPC-EXP-001`, `rules.md#ipc-exp-001`) or a bare `PredefinedFunctions` entry name
prefixed `EXP_` (`RecipeGenerator.scala` builds `s"EXP_${func.toUpperCase}"` for a
recognised predefined function — `ExpressionParsing.scala:129`). `parameters`, when
present, is itself a list of `RecipeTransformation` nodes (nested calls, dot-refs, or
literals) — recursion bottoms out at a `{source}` or `{value}` leaf.

Verbatim corpus example — a nested `TO_DECIMAL(TO_CHAR(ADD_TO_DATE(TO_DATE(...), 'MM',
-1), 'ROWANFIELD'))` call tree
(`CDM/m_DM_INFOHUB_BIZLINK/_ETL_m_DM_INFOHUB_BIZLINK.json:11-37`):

```json
"transformation" : {
  "name" : "EXP_TO_DECIMAL",
  "parameters" : [
    {
      "name" : "EXP_TO_CHAR",
      "parameters" : [
        {
          "name" : "EXP_ADD_TO_DATE",
          "parameters" : [
            {
              "name" : "EXP_TO_DATE",
              "parameters" : [
                { "source" : "SQ_ff_BIZLINK.FCH_DATAENTRY" },
                { "value" : "'YYYYMMDD'" }
              ]
            },
            { "value" : "'MM'" },
            { "value" : "-1" }
          ]
        },
        { "value" : "'ROWANFIELD'" }
      ]
    }
  ]
}
```

### `{ source: "TABLE.FIELD" }` — dot-ref (`RecipeTransformationSource`, `:11`)

A leaf that names an upstream field by `TABLE.FIELD` dot notation, **preserved
verbatim** (`CLAUDE.md` hard rule 3 — never normalized, never case-folded). This is the
edge data every `IPC-REF-*` rule and the frontend's `collectRefs`
(`recipeAdapter.ts:155-165`) walk to derive the canvas graph. Example, from the same
file: `{ "source" : "SQ_ff_BIZLINK.GREENBLUFF" }`.

### `{ value: "literal" }` — literal (`RecipeTransformationValue`, `:13`)

A leaf holding a literal string, date format, or (for the three operator markers below)
the bare operator token itself. Examples from the corpus: `{ "value" : "'YYYYMMDD'" }`
(a quoted SQL string literal — the quote characters are part of the JSON string value),
`{ "value" : "NULL" }`, `{ "value" : "1.0" }`.

### `{ name: "...", outputField, table?, condition?, sourceFilter?, sqlOverride?, matchPolicy, parameters: Field[] }` — lookup (`RecipeTransformationLookup`, `:15-22`)

See "`EXP_LOOKUP` is Field-shaped, not transformation-shaped" below.

## `EXP_LOOKUP` is Field-shaped, not transformation-shaped

`RecipeTransformationLookup.name` defaults to `"EXP_LOOKUP"` in the case class, but
`ExpressionParsing.buildLookupTransformation` (`ExpressionParsing.scala:62-73`) always
overrides that default with the Lookup transformation's own instance name before it
reaches the JSON — so **the literal string `"EXP_LOOKUP"` never appears as a `name`
value in this corpus**; `IPC-EXP-001`'s call-tree walk instead recognises a lookup node
structurally, by the presence of `outputField` (`ExpressionRules.java`'s `CallSite
isLookupShaped`), which is required and non-`Option` uniquely on this case class.

The load-bearing difference from a plain call node: `RecipeTransformationLookup.parameters`
is typed `List[Field]`, not `List[RecipeTransformation]` — each entry is a full
`{name, dataType, transformation}` bind-variable wrapper (the lookup's own input port
bound to an upstream expression), not a bare transformation-tree node. The frontend's
`isFieldShaped` (`frontend/src/api/recipeAdapter.ts:130`, `'transformation' in param`)
is exactly this discriminator: every walker that recurses into a transformation tree
(`walkTransformation`/`collectRefs` in the frontend, `collectCallSites`/
`checkOperatorLiterals`/`collectLookups` in `ExpressionRules.java`) checks
`isFieldShaped`/`isFieldShaped` before deciding whether to recurse into
`param.transformation` (Field-shaped) or `param` itself (bare transformation node).

Verbatim corpus example — an unconnected Lookup (`LKP_LKP_CEDARBROOK`) nested inside a
call tree, its own `parameters` array holding one Field-shaped bind variable
(`DWH/m_OAKCOMBE3_ODS_TEZ52/_ETL_m_OAKCOMBE3_ODS_TEZ52.json:84-107`):

```json
{
  "name" : "EXP_MAPLEVALE_LOOKUP",
  "parameters" : [
    {
      "name" : "LKP_LKP_CEDARBROOK",
      "outputField" : "ID_CEDARBROOK_CENTRALWARD",
      "table" : "LKP_CEDARBROOK",
      "condition" : "ID_CEDARBROOK_CENTRALWARD = EASTGROVE",
      "sourceFilter" : "FCH_MAPLELANE is NULL",
      "matchPolicy" : "Any",
      "parameters" : [
        {
          "name" : "EASTGROVE",
          "dataType" : "String",
          "transformation" : {
            "name" : "EXP_UPPER",
            "parameters" : [ { "source" : "SQ_ODS_TEZ52.EASTGROVE" } ]
          }
        }
      ]
    },
    { "name" : "EXP_UPPER", "parameters" : [ { "source" : "SQ_ODS_TEZ52.EASTGROVE" } ] }
  ]
}
```

`matchPolicy` (`LookupMatchType.scala:7`: `Any | First | Last`) is required —
`IPC-EXP-003` (`rules.md#ipc-exp-003`) validates it. `sqlOverride` is `None` in this
example (key absent, an `Option`); it is present in the case class for connected Lookups
whose SQL override replaces the generated lookup query.

## `PredefinedFunctions` and the four operator sets

`RecipeConstants.scala:48-57` (parser side) and `ExpressionRules.PREDEFINED_FUNCTIONS`
plus the four `*_OPERATORS` sets (`backend/src/main/java/io/pure360/etl360/service/ipc/ExpressionRules.java:30-49`,
backend side) are a deliberate byte-for-byte Java copy of the Scala source — kept
separate to avoid Scala 2.12 collection interop in backend Java, and kept honest by
`IpcRulesContractTest.expressionVocabularyMatchesTheScalaConstants`, which regex-scans
the Scala source and asserts exact set equality against the Java copy on every test run.

**35** `PredefinedFunctions` (verbatim from `RecipeConstants.scala:48-51`; note this is
35, not 36 — an earlier plan draft assumed 36 and was wrong, corrected by literal count):

```
TO_DATE, TO_CHAR, LPAD, RPAD, SUBSTR, REPLACECHR, TO_DECIMAL, REPLACESTR, CONCAT, TRUNC,
TO_INTEGER, LENGTH, UPPER, ISNULL, IS_NUMBER, INSTR, IN, IIF, COUNT, MAX, MIN, GREATEST,
IS_SPACES, DECODE, ABS, ADD_TO_DATE, LAST_DAY, SUM, DATE_DIFF, GET_DATE_PART, IS_DATE,
CHR, REG_MATCH, LEAST, REG_REPLACE
```

A call-tree node whose `name` is `EXP_<one of these>` is a predefined-function call
(e.g. `EXP_TO_DECIMAL`, `EXP_SUBSTR` above); `IPC-EXP-001` accepts any `EXP_*`-prefixed
name unconditionally (the prefix alone is the parser's own marker convention — see
`RecipeGenerator.scala:264-299`'s `StepMode` dispatch for the equivalent convention on
step `type`), so a name being `EXP_`-prefixed already satisfies the rule regardless of
whether the suffix is a `PredefinedFunctions` member; the `PREDEFINED_FUNCTIONS` set
itself only matters for the (rarer) case of a bare, unprefixed function name.

The four operator sets (`RecipeConstants.scala:54-57`), each the vocabulary for one of
the three operator-marker call-tree names below:

| Set | Values | Marker |
|---|---|---|
| `ArithmeticOperators` | `+`, `-`, `*`, `/` | `EXP_ARITHMETIC` |
| `ComparisonOperators` | `<=`, `>=`, `<>`, `!=`, `^=`, `=`, `>`, `<` | `EXP_COMPARISON` |
| `LogicalOperators` | `" AND "`, `" and "`, `" OR "`, `" or "` (leading/trailing spaces are part of the literal — `identifyOperator`, `ExpressionParserUtils.scala:23-44`, captures the list entry verbatim into the embedded value) | `EXP_LOGICAL` |
| `StringOperators` | `\|\|` | `EXP_CONCAT` |

`ExpressionParsing.scala:93-121` builds `EXP_ARITHMETIC`/`EXP_LOGICAL`/`EXP_COMPARISON`
identically: a 3-parameter list `[operand1, {value: operator}, operand2]`, the operator
token embedded verbatim as the middle parameter — the shape `IPC-EXP-002`
(`rules.md#ipc-exp-002`) validates. `EXP_CONCAT` (`:93-97`) is the odd one out: it
**discards** the `||` token itself and keeps only the two operands (2 parameters, not
3), so it is deliberately excluded from `IPC-EXP-002`'s check
(`ExpressionRules.java`'s `OPERATOR_MARKERS` set has 3 entries, not 4).

Verbatim corpus examples of the three checked markers — `EXP_ARITHMETIC`
(`ODS/m_CAS_ODS_EVENTS/_ETL_m_CAS_ODS_EVENTS.json:29-40`):

```json
{
  "name" : "EXP_ARITHMETIC",
  "parameters" : [
    { "source" : "CAS_STG_L_EVENTS.AMOUNT" },
    { "value" : "*" },
    { "value" : "1.0" }
  ]
}
```

`EXP_COMPARISON` (`QDM/m_SYN_QDM_ORDERS_QUALITY/_ETL_m_SYN_QDM_ORDERS_QUALITY.json:22-33`):

```json
{
  "name" : "EXP_COMPARISON",
  "parameters" : [
    { "source" : "DWH_SYN_ORDERS_FACT.TOTAL_ROWS" },
    { "value" : "=" },
    { "value" : "0" }
  ]
}
```

`EXP_LOGICAL` does not occur anywhere in the committed corpus (grep-verified across all
86 recipes, including the `m_CAS_*`/`m_SYN_*` synthetic mappings) — every corpus
condition that combines two boolean sub-expressions happens to route through a
predefined-function call (typically a nested `EXP_IIF`) instead of a bare `AND`/`OR`
infix in the source XML's condition text. `IPC-EXP-002` still validates the shape
because the rule checks *any* occurrence of the three marker names, not a fixed corpus
sample — a future corpus addition that does trigger `EXP_LOGICAL` is covered without a
rule change.

`EXP_CONCAT` (2 parameters, no operator token —
`ODS/OUTERCROSS_WESTVAULT_10032_2/m_ODS_CEDARHOLLOW_12_DEALS/_ETL_m_ODS_CEDARHOLLOW_12_DEALS.json:304-…`):

```json
{
  "name" : "EXP_CONCAT",
  "parameters" : [
    { "name" : "EXP_SUBSTR", "parameters" : [ "…" ] },
    "…"
  ]
}
```

Two more parser markers appear as call-tree `name` values but are neither `EXP_*`
functions nor operators — `IPC-EXP-001` exempts both by name:

- `SequenceGenerator` (`RecipeConstants.scala:33`) — emitted for a field referencing a
  Sequence Generator's `NEXTVAL` port (`RecipeGenerator.scala:314`); carries no
  `parameters` at all. Corpus example: `{ "name" : "SequenceGenerator" }`
  (`ODS/SWIFTMILL_TEALPEAK_10056_1/m_ODS_MAPLECLIFF_HOLDINGS/_ETL_m_ODS_MAPLECLIFF_HOLDINGS.json:12`).
- `Undefined` (`RecipeConstants.scala:39`) — the parser's own can't-classify marker,
  emitted when an expression pattern matches none of the recognised shapes
  (`ExpressionParsing.scala:139-143`), logged as an error at generation time rather than
  failing the run.

## Formula rendering contract

`renderFormula` (`frontend/src/api/recipeAdapter.ts:180-189`, with its parameter helper
`renderFormulaParam` at `:191-194`) renders a transformation tree into the single-line
formula string the canvas/inspector display, and — per its own doc comment — is a
contract a future backend expression registry (Task 11's `FormulaRenderer.java`) must
reproduce byte-identically:

- `{ name, parameters }` → `NAME(p1, p2, …)`, recursively. A Field-shaped parameter
  (the lookup bind-variable wrapper above) renders its nested `.transformation` rather
  than the wrapper object itself (`renderFormulaParam`'s `isFieldShaped` branch).
- `{ source: "T.F" }` → `T.F` **verbatim** — dot-refs are never normalized, per
  `CLAUDE.md` hard rule 3.
- `{ value: "v" }` → `v` verbatim.
- `undefined` or no recognised shape → `''`.

`renderFormula` has no knowledge that `EXP_ARITHMETIC`/`EXP_COMPARISON`/`EXP_LOGICAL`
are operator markers — it renders every `{name, parameters}` node identically as
`NAME(p1, p2, …)`, the operator token included as an ordinary parameter. So the
`EXP_ARITHMETIC` example above renders as
`EXP_ARITHMETIC(CAS_STG_L_EVENTS.AMOUNT, *, 1.0)`, and the `EXP_COMPARISON` example as
`EXP_COMPARISON(DWH_SYN_ORDERS_FACT.TOTAL_ROWS, =, 0)` — prefix call notation
throughout, never infixed. (A human-readable infix rendering of operator markers, if
ever wanted, would be a UI enhancement layered on top of this contract, not a change to
it.)

## Applicable rules

- `IPC-EXP-001` — call-tree `name` vocabulary (`rules.md#ipc-exp-001`).
- `IPC-EXP-002` — operator literal vocabulary (`rules.md#ipc-exp-002`).
- `IPC-EXP-003` — `EXP_LOOKUP.matchPolicy` vocabulary (`rules.md#ipc-exp-003`).
- `IPC-FLW-004` — every `EXP_LOOKUP`'s `condition` references at least one of its own
  `parameters[].name` bind variables (`rules.md#ipc-flw-004`).
