package io.pure360.ipc.xmltojson.sql.calcite

import org.apache.calcite.sql._

import scala.collection.JavaConverters._

/**
 * Transforms the Oracle SQL identifier `SYSDATE` to the BigQuery SQL function `CURRENT_TIMESTAMP`.
 *
 * SYSDATE -> CURRENT_TIMESTAMP()
 *
 * Oracle's `SYSDATE` returns the current date and time. In BigQuery, the equivalent function
 * is `CURRENT_TIMESTAMP`, which provides the current timestamp in UTC.
 *
 * This transformer processes `SYSDATE` when it is represented in the AST as a `SqlIdentifier`.
 * It replaces `SYSDATE` with a function call to `CURRENT_TIMESTAMP()` (with no arguments).
 */
class SysdateTransformer extends SqlIdentifierTransformer {

  /**
   * This method replace Oracle identifier by GCP BQ variant in case of customization
   *
   * @param identifier - the current Sql identifier
   * @return - a transformed Sql node
   */
  override def transform(identifier: SqlIdentifier): SqlNode = {
    // Replace SYSDATE with CURRENT_TIMESTAMP() in BigQuery
    new SqlBasicCall(
      new SqlFunction(
        "CURRENT_TIMESTAMP",          // BigQuery function name
        SqlKind.OTHER_FUNCTION,       // Function kind
        null,                         // Return type inference
        null,                         // Operand type-checker
        null,                         // Operand type inference
        SqlFunctionCategory.TIMEDATE  // Function category
      ),
      List().asJava,                  // CURRENT_TIMESTAMP has no arguments
      identifier.getParserPosition    // Preserve the original position in the SQL query
    )
  }
}
