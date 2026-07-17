# pure-scala-ipc-360

Parses Informatica PowerCenter XML exports into platform-agnostic `_ETL_*.json`
transformation recipes (plus BigQuery DDL JSON and SQL translations).

## Layout
- `src/main/scala/io/pure360/ipc/xmltojson` — parser (entry point `XMLParser`)
- `src/main/resources/xmltobq` — sample IPC XML corpus + generated recipes
- `src/main/resources/DWH_CONTROL` — layer-to-layer runtime config (CSV)

## Run
    mvn compile
    mvn exec:java -Dexec.mainClass=io.pure360.ipc.xmltojson.XMLParser \
      -Dexec.args="--projectId pure360-dev-project --xmlPath src/main/resources/xmltobq/DWH --failedMkFile target/failed_mk.txt --generateRecipe"

All sample data is synthetic/anonymized.
