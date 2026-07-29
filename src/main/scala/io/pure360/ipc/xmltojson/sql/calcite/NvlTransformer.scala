package io.pure360.ipc.xmltojson.sql.calcite

import org.apache.calcite.sql.fun.SqlStdOperatorTable
import org.apache.calcite.sql.{SqlBasicCall, SqlCall}

/**
 * Transforms Oracle SQL function `NVL` to BigQuery SQL function `COALESCE`.
 *
 * NVL(column, default_value) -> COALESCE(column, default_value)
 *
 * Oracle's `NVL` replaces `NULL` values in a column or expression with a default value.
 * In BigQuery, the equivalent function is `COALESCE`, which can handle multiple arguments
 * to determine the first non-NULL value.
 */
class NvlTransformer extends SqlFunctionTransformer {

  override def transform(function: SqlCall): SqlCall = {
    val args = function.getOperandList
    // Explicitly create a new SqlFunction for IFNULL
    /*val ifNullFunction = new SqlFunction(
      "IFNULL",                       // Function name
      SqlKind.OTHER_FUNCTION,         // Function kind
      null,                           // Return type inference (null for simplicity)
      null,                           // Operand type checker
      null,                           // Operand type inference
      SqlFunctionCategory.STRING      // Function category (STRING, NUMERIC, etc.)
    )

    // Replace NVL with IFNULL
    new SqlBasicCall(
      ifNullFunction,                // New function representing IFNULL
      args,                          // Pass the arguments
      function.getParserPosition     // Preserve the original position in SQL query
    )*/
    new SqlBasicCall(
      SqlStdOperatorTable.COALESCE,
      args,
      function.getParserPosition
    )
  }

}

