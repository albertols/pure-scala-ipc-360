# XMLParser

Parses Informatica PowerCenter (IPC) XML exports into platform-agnostic `_ETL_*.json`
transformation recipes, BigQuery DDL JSON schemas, and Oracle→BigQuery SQL translations.
Deep-dive into the parsing algorithm: [_DWH_Transformations_and_XML_Parsing.md](_DWH_Transformations_and_XML_Parsing.md)

> This is the standalone, slimmed extraction of the parser: no Spark, BigQuery, GCS or
> xlsx dependencies. Everything runs locally from XML input to JSON output.

## Data Mapping

### Oracle/DB2/Cobol/FF -> BigQuery
- [Oracle SQL translation guide](https://cloud.google.com/bigquery/docs/migration/oracle-sql)

| Oracle Type                                             | BigQuery Type | Comments              |
|:--------------------------------------------------------|:--------------|:----------------------|
| NUMBER(p, s)                                            | INT64         | If s = 0 and p <= 18. |
| NUMBER(p, s)                                            | NUMERIC       | If s = 0 and p > 18.  |
| NUMBER(p, s)                                            | NUMERIC       | If s != 0             |
| NUMBER                                                  | NUMERIC       |                       |
| INTEGER                                                 | INT64         |                       |
| VARCHAR, VARCHAR2, CHAR, NVARCHAR2, STRING, CLOB, NCHAR | STRING        |                       |
| DATETIME                                                | DATETIME      |                       |
| DATE                                                    | DATE          |                       |
| TIMESTAMP                                               | TIMESTAMP     |                       |

### Oracle/DB2/Cobol/FF -> Scala
| Oracle Type                                             | Scala Type              | Comments              |
|:--------------------------------------------------------|:------------------------|:----------------------|
| NUMBER(p, s)                                            | Long                    | If s = 0 and p <= 18. |
| NUMBER(p, s)                                            | BigDecimal              | If s = 0 and p > 18.  |
| NUMBER(p, s)                                            | BigDecimal              | If s != 0             |
| NUMBER                                                  | BigDecimal              |                       |
| INTEGER                                                 | Long                    |                       |
| VARCHAR, VARCHAR2, CHAR, NVARCHAR2, STRING, CLOB, NCHAR | String                  |                       |
| DATETIME                                                | java.time.LocalDateTime |                       |
| DATE                                                    | java.time.LocalDate     |                       |
| TIMESTAMP                                               | java.sql.Timestamp      |                       |

### Informatica -> Scala
| Informatica Type      | Scala Type         | Comments |
|:----------------------|:-------------------|:---------|
| decimal               | BigDecimal         |          |
| double                | BigDecimal         |          |
| bigint                | Long               |          |
| integer               | Integer            |          |
| string, nstring, text | String             |          |
| date/time             | java.sql.Timestamp |          |

## XML Data Preparation

Before parsing, [XMLReplacementExecutor.scala](XMLReplacementExecutor.scala) prepares the
Powermart XML (legacy-flow adoption).

### ODS
- Legacy flows are intercepted by the pattern `"^(s_)?m_STG_.*"`
- The following name replacement is performed

| XML Element              | Old name value      | New name value  | Notes                                                                                                    |
|--------------------------|---------------------|-----------------|----------------------------------------------------------------------------------------------------------|
| Source                   | SOME_FLAT_FILE_NAME | STG_TARGET_NAME | Source to be renamed is identified by the most similarity between initial FF source and STG target names |
| Target                   | STG_TARGET_NAME     | ODS_TARGET_NAME |                                                                                                          |
| Instance type = "SOURCE" | SOME_FLAT_FILE_NAME | STG_TARGET_NAME | Only transformation name is replaced                                                                     |
| Instance type = "TARGET" | STG_TARGET_NAME     | ODS_TARGET_NAME | Only transformation name is replaced                                                                     |

- To identify the source FF to be replaced, the most-similar-word function compares the initial STG target name with the FF name.

### ETL, DWH, CDM, RDM, QDM
- The following name replacement is performed

| XML Element              | Old name value  | New name value  | Notes                                |
|--------------------------|-----------------|-----------------|--------------------------------------|
| Source                   | STG_SOURCE_NAME | ODS_SOURCE_NAME | To reflect ODS target                |
| Instance type = "SOURCE" | STG_SOURCE_NAME | ODS_SOURCE_NAME | Only transformation name is replaced |

> Note: in the original spark-etl project the preparation step also injected SQL queries
> for partitioned flows and rewrote datatypes based on session write-mode / partition-info
> tables read from BigQuery and control CSVs. In this standalone build those inputs are
> always empty, so that part of the preparation is inert.

## Input

| Layer | Folder |
|-------|--------|
| ODS   | ODS    |
| ETL   | ETL    |
| DWH   | DWH    |
| CDM   | CDM    |
| QDM   | QDM    |
| RDM   | RDM    |

- Place Informatica PowerCenter .XML under [src/main/resources/xmltobq](../../../../../resources/xmltobq)
  - `ODS/` follows a `ODS/<NAR_ID>/*.xml` structure (`<NAR_ID>` matching `datasetIdWithNARRegex`, e.g. `CURRENT_ACCOUNTS_385_2`)
  - `ETL`, `DWH`, `CDM`, `RDM`, `QDM` hold `.xml` files directly.
- **xmlPath**: path to the input xml file, or a directory scanned recursively.

## Output

Outputs are written next to each XML, in a directory named after the mapping.

- **generateDDLContent**: enables writing DDL content (required for the DDL files to have content)
- **generateSourceDDL**: `SOURCE_NAME.json` BigQuery schema per source (can be more than one)
- **generateTargetDDL**: `TARGET_NAME.json` BigQuery schema per target (excludes ERR_/CONTROL_ERROR targets)
- **generateRecipe**: `_ETL_<mapping>.json` transformation recipe and `_sqlTranslations_ETL_<mapping>.json` (only when the mapping contains SQL to translate)

```
mvn compile exec:java -Dexec.args="--xmlPath src/main/resources/xmltobq/ --generateDDLContent --generateRecipe --generateTargetDDL --generateSourceDDL"
```

## Sql Content Translation
- Produced by [SqlTranslatorGenerator.scala](sql/SqlTranslatorGenerator.scala) with two backends:
  Apache Calcite ([sql/calcite](sql/calcite)) and SqlGlot ([sql/sqlglot](sql/sqlglot)).
- Optional manual overrides: `src/main/resources/xmltobq/_sqlTranslations_manual.json`
  (`"mappingName.transformationName" -> sql`); missing file is fine.
