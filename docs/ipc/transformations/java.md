# `java`

## What IPC says

The Java transformation is IPC's own transformation type, exposed in the XML as a
`<TRANSFORMATION TYPE="Custom Transformation">` whose `TEMPLATENAME` attribute is
`"Java Transformation"` (`RecipeConstants.CustomTransformation = "Custom
Transformation"`, `RecipeConstants.JavaTransformation = "Java Transformation"`,
`RecipeConstants.scala:23,25`) — a generic "Custom Transformation" wrapper IPC also uses
for Union (see `union.md`). It lets a developer embed a Java code snippet executed per
input row. The rule catalogue carries no `ipcRef` for this kind (`IPC-TYP-JAVA-001`'s
`ipcRef` is blank in `ipc-rules.json`) — no verified Informatica transformation-guide
URL is cited here.

## What the parser emits

- **Target**: `JavaTarget(name: String, `type`: String = "java", javaCode: String,
  fields: List[Field])` — `parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractTarget.scala:80-83`.
  Built by `AbstractTargetFactory.createJavaTarget` (`AbstractTargetFactory.scala:162-167`):
  `javaCode` is read from the `"OnInputRow_Method_Snippet"` metadata extension
  (`XMLDataUtils.getMetadataExtensionValue`), defaulting to `""` when absent (unlike
  every other required-string key in this catalogue, this one is never `null`/missing —
  it degrades to an empty string).
- **Source**: `JavaSource(name: String, `type`: String = "java")` —
  `parser/src/main/scala/io/pure360/ipc/model/recipe/AbstractSource.scala:42-43`. A bare
  name (`AbstractSourceFactory.createJavaSource`, `AbstractSourceFactory.scala:95`).

JSON keys: `name`, `type`, `fields[]` (target only), `javaCode` (target-only, required
string — `IPC-TYP-JAVA-001`, `rules.md#ipc-typ-java-001`).

## Recipe JSON shape

Verbatim (code elided for length; the string is one escaped multi-line Java snippet),
`ETL/m_DWH_E_MAPLEGROVE_CALLHUB_MAPLEBEND_OAKRIVER/_ETL_m_DWH_E_MAPLEGROVE_CALLHUB_MAPLEBEND_OAKRIVER.json:738-743`:

```json
"target" : {
  "name" : "ASHYARD_ashgate",
  "type" : "java",
  "javaCode" : "// ToDo: Enter jadefield to process an input row here.\n...NUM_TIMESPAN_BRISKDOCK_SOUTHTHORP+= Double.parseDouble(ls[maplecreek]);}\n}\nelse\n{NUM_TIMESPAN_BRISKDOCK_SOUTHTHORP=0;}",
  "fields" : [ "…" ]
}
```

This same file/step is `IPC-REF-002`'s corpus evidence item (3) (`rules.md#ipc-ref-002`):
the java code references an output variable
(`NUM_TIMESPAN_BRISKDOCK_SOUTHTHORP`, confirmed present in the source XML as an
`OUTPUT` port) that is simply absent from this step's own `fields[]` array — parser-level
information loss, not a rule-completeness gap.

## Corpus occurrences

**1** target occurrence, **1** source occurrence. No anonymizer token — `java` survives
as the literal string in the committed corpus.

## Rules

- `IPC-TYP-JAVA-001` — target must specify `javaCode` (`rules.md#ipc-typ-java-001`).
- The structural family (`IPC-STR-001`–`009`) and referential family (`IPC-REF-001`–`006`,
  `rules.md`) apply — see `IPC-REF-002`'s corpus evidence above for this kind's one
  known gap.
