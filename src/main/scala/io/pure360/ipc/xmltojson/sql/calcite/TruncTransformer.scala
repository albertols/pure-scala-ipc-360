package io.pure360.ipc.xmltojson.sql.calcite

import org.apache.calcite.sql._
import org.apache.calcite.sql.parser.SqlParserPos

import scala.collection.JavaConverters._

/**
 * Transforms Oracle SQL function `TRUNC` to BigQuery SQL function `DATE_TRUNC` if called with two arguments.
 *
 * TRUNC(date_expr, 'precision') -> DATE_TRUNC(date_expr, precision)
 * TRUNC(expr)                   -> expr (unchanged)
 *
 * Oracle's `TRUNC` function:
 * - When called with two arguments (e.g., date and granularity), truncates or rounds a date/timestamp
 *   to the specified precision (e.g., month, year, etc.).
 * - When called with one argument, performs a default truncation (e.g., rounding numbers).
 * In BigQuery, the equivalent for date truncation is the `DATE_TRUNC` function, which supports
 * similar functionality for two arguments. Other cases are handled without modification.
 */
class TruncTransformer extends SqlFunctionTransformer {

  /**
   * This method replace Oracle function by GCP BQ variant in case of customization
   *
   * @param function - the current Sql function
   * @return
   */
  override def transform(function: SqlCall): SqlCall = {
    val args = function.getOperandList

    // Check if TRUNC has exactly 2 arguments
    if (args.size() == 2) {
      val dateExpr = args.get(0) // First argument: date or timestamp expression
      val precisionExpr = args.get(1) // Second argument: string defining precision (e.g., 'MONTH')

      // Transform TRUNC to DATE_TRUNC in BigQuery
      new SqlBasicCall(
        new SqlFunction(
          "DATE_TRUNC",               // BigQuery function name
          SqlKind.OTHER_FUNCTION,     // Function kind
          null,                       // Return type inference
          null,                       // Operand type-checker
          null,                       // Operand type inference
          SqlFunctionCategory.TIMEDATE // Function category
        ),
        List(
          dateExpr,                   // The date or timestamp expression
          SqlLiteral.createCharString(
            precisionExpr.toString.stripPrefix("'").stripSuffix("'"), // Strip quotes from precision (e.g., 'MONTH')
            SqlParserPos.ZERO
          )                          // The string defining granularity
        ).asJava,
        function.getParserPosition    // Preserve the original position in the SQL query
      )
    } else {
      // If arguments are invalid or not supported, return the function unchanged
      function
    }
  }
}
