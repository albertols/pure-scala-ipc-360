# Rules — the `IPC-*` catalogue

The full rule catalogue: 35 rules across five families (`IPC-STR-*` structural 9,
`IPC-TYP-*` type shape 13, `IPC-REF-*` referential 6, `IPC-FLW-*` dataflow 4,
`IPC-EXP-*` expression 3), in the order they appear in
`backend/src/main/resources/ipc/ipc-rules.json`, which `IpcCatalog` (`IpcCatalog.java:76`)
serves as-is via `catalog.rules()` — that JSON order **is** id order for this catalogue,
since the file itself is grouped family-by-family. Rule *logic* lives in Java
(`backend/src/main/java/io/pure360/etl360/service/ipc/`, one checker class per family);
this page carries rule *metadata* only — statement, severity, and citations — read
verbatim from the catalogue JSON, never re-derived. `IpcRulesContractTest` enforces the
three-way parity: every id registered in the Java engine has a catalogue entry, every
catalogue entry is documented here, and every `wikiRef` resolves to a real file.

31 of the 35 rules ship `severity: error` — the committed corpus validates against all
of them with **zero** violations (`IpcRulesContractTest.everyCorpusRecipeIsErrorFree`).
The remaining 4 (`IPC-REF-002`, `IPC-REF-003`, `IPC-REF-006`, `IPC-FLW-001`) ship
`severity: warning` because the corpus contains genuine violations under the
deterministic severity-assignment procedure (`00-model-map.md`'s sibling design spec
§5.4): run the full catalogue over all 86 corpus recipes; any rule with zero violations
ships `error`, any rule with violations ships `warning`. Each warning's **Corpus
evidence** line below is copied verbatim from that rule's `corpusEvidence` field in
`ipc-rules.json` — these strings were independently re-verified in a Task 5 fix round
after an earlier draft (derived from a truncated AssertJ printout) had the counts and,
in one case, the dominant cause wrong. If a sentence elsewhere in this wiki ever
disagrees with the JSON, **the JSON wins**.

Two of the four warnings — `IPC-REF-002` and `IPC-EXP-001` — describe a rule whose
*logic* was completed during that same fix round rather than left downgraded: read their
Corpus evidence lines for what each rule now recognises and what provably can't be
closed by rule logic alone (parser-level data loss, in `IPC-REF-002`'s case). The other
two warnings, `IPC-REF-003` and `IPC-REF-006`, describe corpus patterns that are
genuinely outside any single rule's reach; `IPC-FLW-001` is a pure downstream
consequence of `IPC-REF-003` — fixing `IPC-REF-003`'s gap would clear `IPC-FLW-001` too,
since `IPC-FLW-001`'s 8 offending recipes are a strict subset of `IPC-REF-003`'s 9.

Each entry below carries the rule's `statement` verbatim, its `severity`, a **Parser**
citation (`parserRef`, linked to the source file), an **IPC** citation (`ipcRef` linked,
or "no direct IPC equivalent" when the rule is a parser-model invariant with nothing to
cite upstream — see the provenance policy in `README.md`), and — for every `warning` —
the **Corpus evidence** that forced the downgrade. Three statements below embed a
literal `<placeholder>` token (e.g. `<joiner>.MASTER`); those angle brackets are
HTML-entity-escaped (`&lt;`/`&gt;`) so a markdown renderer doesn't swallow them as an
(invalid) HTML tag — every other character is byte-identical to `ipc-rules.json`.

## `IPC-STR-*` — structural (9, all `error`)

### IPC-STR-001

steps must be a non-empty array

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/Recipe.scala:5`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/Recipe.scala)
- **IPC:** [https://docs.informatica.com/data-integration/powercenter/10-5/designer-guide/mappings/validating-a-mapping.html](https://docs.informatica.com/data-integration/powercenter/10-5/designer-guide/mappings/validating-a-mapping.html)

### IPC-STR-002

every step must carry a target object

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/Recipe.scala:7`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/Recipe.scala)
- **IPC:** no direct IPC equivalent — this is a parser-model invariant

### IPC-STR-003

every step target must have a non-blank name

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractItem.scala:7`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractItem.scala)
- **IPC:** no direct IPC equivalent — this is a parser-model invariant

### IPC-STR-004

every step target must have a non-blank type

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractItem.scala:8`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractItem.scala)
- **IPC:** no direct IPC equivalent — this is a parser-model invariant

### IPC-STR-005

every step target type must resolve to a known kind (canonical or alias)

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala:6`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala)
- **IPC:** [https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/working-with-transformations/transformations-overview/active-transformations.html](https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/working-with-transformations/transformations-overview/active-transformations.html)

### IPC-STR-006

step target names must be unique within a recipe

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/Recipe.scala:7`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/Recipe.scala)
- **IPC:** no direct IPC equivalent — this is a parser-model invariant

### IPC-STR-007

field names must be unique within a step target

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/Recipe.scala:9`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/Recipe.scala)
- **IPC:** no direct IPC equivalent — this is a parser-model invariant

### IPC-STR-008

every field dataType must be a ScalaType value

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/enums/ScalaType.scala:7`](../../parser/src/main/scala/io/pure360/ipc/model/enums/ScalaType.scala)
- **IPC:** no direct IPC equivalent — this is a parser-model invariant

### IPC-STR-009

every field must have a non-blank name

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/Recipe.scala:9`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/Recipe.scala)
- **IPC:** no direct IPC equivalent — this is a parser-model invariant

## `IPC-TYP-*` — type shape (13, all `error`)

### IPC-TYP-REQUIRED-KEYS

no per-kind required key (per keySchema) is missing from a step target or source — the umbrella id the generic driver reports when it finds zero violations; each actual violation is reported under the specific IPC-TYP-&lt;KIND&gt;-NNN id from the key's ruleId

- **Severity:** error
- **Parser:** [`backend/src/main/java/io/pure360/etl360/service/ipc/TypeShapeRules.java:81`](../../backend/src/main/java/io/pure360/etl360/service/ipc/TypeShapeRules.java)
- **IPC:** no direct IPC equivalent — this is a parser-model invariant

### IPC-TYP-SOURCEQUALIFIER-001

source qualifier target must specify selectDistinct as a boolean

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala:25`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala)
- **IPC:** no direct IPC equivalent — this is a parser-model invariant

### IPC-TYP-ROUTER-001

router target must specify groups as an array of RouterGroup

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala:44`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala)
- **IPC:** [https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/router-transformation/working-with-groups/adding-groups.html](https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/router-transformation/working-with-groups/adding-groups.html)

### IPC-TYP-ROUTER-002

router groups may include at most one default group (default: true)

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala:47`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala)
- **IPC:** [https://docs.informatica.com/data-integration/powercenter/10-4-0/transformation-guide/router-transformation/working-with-groups/output-groups/the-default-group.html](https://docs.informatica.com/data-integration/powercenter/10-4-0/transformation-guide/router-transformation/working-with-groups/output-groups/the-default-group.html)

### IPC-TYP-ROUTER-003

router source must specify group, the upstream output group name it reads from

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractSource.scala:37`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractSource.scala)
- **IPC:** [https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/router-transformation/working-with-groups/adding-groups.html](https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/router-transformation/working-with-groups/adding-groups.html)

### IPC-TYP-AGGREGATOR-001

aggregator target must specify groupByFields as an array

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala:39`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala)
- **IPC:** [https://docs.informatica.com/data-integration/powercenter/10-4-0/transformation-guide/aggregator-transformation/group-by-ports.html](https://docs.informatica.com/data-integration/powercenter/10-4-0/transformation-guide/aggregator-transformation/group-by-ports.html)

### IPC-TYP-NORMALIZER-001

normalizer target must specify normalizedFields as an array

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala:60`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala)
- **IPC:** [https://docs.informatica.com/integration-cloud/data-integration/current-version/transformations/normalizer-transformation.html](https://docs.informatica.com/integration-cloud/data-integration/current-version/transformations/normalizer-transformation.html)

### IPC-TYP-NORMALIZER-002

every normalized field's refSource must reference at least one input field

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala:76`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala)
- **IPC:** [https://docs.informatica.com/integration-cloud/data-integration/current-version/transformations/normalizer-transformation/normalized-fields/generated-keys.html](https://docs.informatica.com/integration-cloud/data-integration/current-version/transformations/normalizer-transformation/normalized-fields/generated-keys.html)

### IPC-TYP-JAVA-001

java target must specify javaCode

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala:82`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala)
- **IPC:** no direct IPC equivalent — this is a parser-model invariant

### IPC-TYP-STOREDPROCEDURE-001

stored procedure target must specify procedureName

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala:87`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala)
- **IPC:** [https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/stored-procedure-transformation/stored-procedure-transformation-overview/connected-and-unconnected.html](https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/stored-procedure-transformation/stored-procedure-transformation-overview/connected-and-unconnected.html)

### IPC-TYP-JOINER-001

joiner source must specify joinerTables, joinerType and joinerCondition

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractSource.scala:28-30`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractSource.scala)
- **IPC:** [https://docs.informatica.com/data-integration/powercenter/10-4-0/transformation-guide/joiner-transformation/defining-a-join-condition.html](https://docs.informatica.com/data-integration/powercenter/10-4-0/transformation-guide/joiner-transformation/defining-a-join-condition.html)

### IPC-TYP-JOINERINPUT-001

joiner input target name must be &lt;joiner&gt;.MASTER or &lt;joiner&gt;.DETAIL

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/transformation/AbstractTargetFactory.scala:88`](../../parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/transformation/AbstractTargetFactory.scala)
- **IPC:** [https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/joiner-transformation/joiner-transformation-overview.html](https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/joiner-transformation/joiner-transformation-overview.html)

### IPC-TYP-UNION-001

union source must specify unionTables, and every fieldMapping entry must carry both origin and union

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractSource.scala:8-14`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractSource.scala)
- **IPC:** [https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/union-transformation/working-with-groups-and-ports.html](https://docs.informatica.com/data-integration/powercenter/10-5/transformation-guide/union-transformation/working-with-groups-and-ports.html)

## `IPC-REF-*` — referential (6, 3 `error` + 3 `warning`)

### IPC-REF-001

every dot-ref T.F's table T resolves to a step target, a step source, or a table.sourceTableNames entry (case-insensitive)

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/RecipeGenerator.scala:259`](../../parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/RecipeGenerator.scala)
- **IPC:** no direct IPC equivalent — this is a parser-model invariant

### IPC-REF-002

when T names a step target, F must exist among that target's fields, OR — for router/normalizer/storedProcedure targets — that kind's own downstream-visible namespace (a router's group-qualified &lt;group&gt;.&lt;port&gt; against that group's own fields; a normalizer's normalizedFields; a storedProcedure's returnField)

- **Severity:** warning
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala:44-87`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala)
- **IPC:** no direct IPC equivalent — this is a parser-model invariant
- **Corpus evidence:** 28 violations across 4 recipes remain after resolving router/normalizer/storedProcedure namespaces (this rule's logic now recognises all three — see ReferentialRules.resolvesAgainstTargetField); none of the residue is a further rule-completeness gap, each is data the parser itself never emitted into the recipe JSON: (1) 25 in CDM/m_DM_LKP_CONTACTREF_MEMBER_NETHUB_PAIR/_ETL_m_DM_LKP_CONTACTREF_MEMBER_NETHUB_PAIR.json @$.steps[10].target.fields[0].transformation — the same paired-Lookup encoding IPC-REF-006 flags: the union-input step's own fields carry a numeric disambiguation suffix (e.g. "ID_BIRCHCROSS_NETHUB2") the paired sourceQualifier's cross-references don't use ("ID_BIRCHCROSS_NETHUB"), and unlike Router's REF_FIELD attribute there is no structural hint in the JSON (or the source XML) linking the two; (2) 2 (CDM/m_DM_LKP_ACT_MAPLEDELL_CEDARFORGE and ETL/m_DWH_E_F_OVERSIGHT_PLEDGES_MONTHLY, e.g. @$.steps[1].target.fields[38].transformation) — a Normalizer GENERATED KEY/GENERATED COLUMN ID port's real XML name (anonymized, e.g. "BLUERIDGE_IMP_PLEDGE") is discarded by AbstractTargetFactory.scala:144-152, which folds it into one normalizedFields entry keyed by the base field name only; (3) 1 (ETL/m_DWH_E_MAPLEGROVE_CALLHUB_MAPLEBEND_OAKRIVER/_ETL_m_DWH_E_MAPLEGROVE_CALLHUB_MAPLEBEND_OAKRIVER.json @$.steps[0].target.fields[98].transformation) — a java target's OUTPUT port ("NUM_TIMESPAN_BRISKDOCK_SOUTHTHORP", confirmed present in the source XML) is simply absent from that step's own fields array. All three are parser-level information loss, not a gap this rule's logic can close by reading a different JSON key.

### IPC-REF-003

every sources[].name resolves to a step target or a table.sourceTableNames entry

- **Severity:** warning
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractItem.scala:7`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractItem.scala)
- **IPC:** no direct IPC equivalent — this is a parser-model invariant
- **Corpus evidence:** 23 violations across 9 recipes, two distinct genuine-corpus sub-patterns: (1) 15 (10 union + 5 joiner) — e.g. CDM/m_DM_LKP_CONTACTREF_MEMBER_NETHUB_PAIR/_ETL_m_DM_LKP_CONTACTREF_MEMBER_NETHUB_PAIR.json @$.steps[0].sources[0].name — a joiner's or union's OUTPUT is referenced downstream by the transformation's own bare name ("JNR_Ashshore", "Union_NETHUB"), which never appears as a step target name (only its MASTER/DETAIL joinerInput children, or its per-group unionInput children, do); (2) 8, type: "table" sources absent from table.sourceTableNames — e.g. ETL/m_DWH_E_F_OVERSIGHT/_ETL_m_DWH_E_F_OVERSIGHT.json @$.steps[5].sources[1].name ("DWH_MAPLEGROVE_TIMESPAN") and ETL/m_DWH_E_F_OVERSIGHT_PLEDGES_MONTHLY/_ETL_m_DWH_E_F_OVERSIGHT_PLEDGES_MONTHLY.json @$.steps[4].sources[1].name ("ODS_F_MIS_PACTS") — confirmed against the source XML: these table names appear ONLY inside embedded SQL text ("Source Filter"/"User Defined Join"/"Lookup Sql Override"/"Lookup table name" attributes), never as an actual &lt;SOURCE&gt; element, so table.sourceTableNames (built strictly from declared &lt;SOURCE&gt; elements, XMLDataUtils.getSourceNames) never captures them even though some source-extraction step turned them into a type: "table" sources[] entry. Genuine gap between two source-provenance mechanisms, not a rule-completeness bug.

### IPC-REF-004

no field may reference its own step

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/RecipeGenerator.scala:259`](../../parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/RecipeGenerator.scala)
- **IPC:** no direct IPC equivalent — this is a parser-model invariant

### IPC-REF-005

table.targetTableNames contains every type: "table" step target name

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/RecipeGenerator.scala:60`](../../parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/RecipeGenerator.scala)
- **IPC:** no direct IPC equivalent — this is a parser-model invariant

### IPC-REF-006

the step reference graph is acyclic

- **Severity:** warning
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/RecipeGenerator.scala:82-98`](../../parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/RecipeGenerator.scala)
- **IPC:** no direct IPC equivalent — this is a parser-model invariant
- **Corpus evidence:** 2 violations, e.g. CDM/m_DM_LKP_CONTACTREF_MEMBER_NETHUB_PAIR/_ETL_m_DM_LKP_CONTACTREF_MEMBER_NETHUB_PAIR.json @$.steps[10].target — a connected Lookup is recipe-encoded as a paired unionInput (condition ports) + sourceQualifier (return ports) step, each sourcing fields from the other, a genuine two-node cycle inherent to that encoding

## `IPC-FLW-*` — dataflow (4, 3 `error` + 1 `warning`)

### IPC-FLW-001

every non-source step is reachable from at least one source

- **Severity:** warning
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/RecipeGenerator.scala:88-98`](../../parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/RecipeGenerator.scala)
- **IPC:** no direct IPC equivalent — this is a parser-model invariant
- **Corpus evidence:** 20 violations across 8 recipes, e.g. CDM/m_DM_LKP_CONTACTREF_MEMBER_NETHUB_PAIR/_ETL_m_DM_LKP_CONTACTREF_MEMBER_NETHUB_PAIR.json @$.steps[0].target.name — every one is a downstream consequence of IPC-REF-003's joiner/union bare-name gap (all 8 recipes are a subset of IPC-REF-003's 9): the reachability graph seeds "source" steps by exact-matching sources[].name against step target names, so a joiner/union output source never joins the BFS from its MASTER/DETAIL or per-group input steps, stranding that step and everything downstream of it that has no other source-reading ancestor

### IPC-FLW-002

every table.targetTableNames entry exists as a step target

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/RecipeGenerator.scala:60-62`](../../parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/RecipeGenerator.scala)
- **IPC:** no direct IPC equivalent — this is a parser-model invariant

### IPC-FLW-003

no orphan step (no inbound refs and no outbound refs)

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/RecipeGenerator.scala:259`](../../parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/RecipeGenerator.scala)
- **IPC:** no direct IPC equivalent — this is a parser-model invariant

### IPC-FLW-004

every EXP_LOOKUP's condition references at least one of its own parameters[].name bind variables

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/recipe/RecipeTransformation.scala:15-22`](../../parser/src/main/scala/io/pure360/ipc/model/recipe/RecipeTransformation.scala)
- **IPC:** [https://docs.informatica.com/data-quality-and-governance/informatica-data-quality/10-5/developer-transformation-guide/lookup-transformation.html](https://docs.informatica.com/data-quality-and-governance/informatica-data-quality/10-5/developer-transformation-guide/lookup-transformation.html)

## `IPC-EXP-*` — expression (3, all `error`)

### IPC-EXP-001

call-tree name values are EXP_* markers, members of RecipeConstants.PredefinedFunctions, a lookup reference (node carries outputField), or the parser's SequenceGenerator/Undefined markers

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/RecipeConstants.scala:33-51`](../../parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/RecipeConstants.scala)
- **IPC:** no direct IPC equivalent — this is a parser-model invariant

### IPC-EXP-002

bare {value} operator literals belong to the arithmetic/comparison/logical/string operator sets

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/expression/ExpressionParsing.scala:98-121`](../../parser/src/main/scala/io/pure360/ipc/xmltojson/recipe/expression/ExpressionParsing.scala)
- **IPC:** no direct IPC equivalent — this is a parser-model invariant

### IPC-EXP-003

EXP_LOOKUP.matchPolicy is one of Any, First, Last

- **Severity:** error
- **Parser:** [`parser/src/main/scala/io/pure360/ipc/model/enums/LookupMatchType.scala:7`](../../parser/src/main/scala/io/pure360/ipc/model/enums/LookupMatchType.scala)
- **IPC:** [https://docs.informatica.com/data-quality-and-governance/informatica-data-quality/10-5/developer-transformation-guide/lookup-transformation.html](https://docs.informatica.com/data-quality-and-governance/informatica-data-quality/10-5/developer-transformation-guide/lookup-transformation.html)
