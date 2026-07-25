# pure-scala-ipc-360

Parses Informatica PowerCenter XML exports into platform-agnostic `_ETL_*.json`
transformation recipes (plus BigQuery DDL JSON and SQL translations).
Pure Scala/JVM — no Spark, BigQuery, or GCS required.

## Layout
- `src/main/scala/io/pure360/ipc/xmltojson` — parser (entry point `XMLParser`, [docs](src/main/scala/io/pure360/ipc/xmltojson/README.md))
- `src/main/resources/xmltobq` — sample IPC XML corpus + generated recipes

## Run
    mvn compile
    mvn exec:java -Dexec.args="--xmlPath src/main/resources/xmltobq/DWH --generateDDLContent --generateRecipe --generateTargetDDL --generateSourceDDL"

Outputs land next to each XML in a directory named after the mapping.

All sample data is synthetic/anonymized.
