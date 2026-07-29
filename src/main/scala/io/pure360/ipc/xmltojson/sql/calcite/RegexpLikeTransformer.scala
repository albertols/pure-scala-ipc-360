package io.pure360.ipc.xmltojson.sql.calcite

import org.apache.calcite.sql._
import org.apache.calcite.sql.parser.SqlParserPos

import scala.collection.JavaConverters._

/**
 * Transforms Oracle SQL function `REGEXP_LIKE` to BigQuery SQL function `REGEXP_CONTAINS`.
 *
 * REGEXP_LIKE(column, pattern) -> REGEXP_CONTAINS(column, pattern)
 *
 * Oracle's `REGEXP_LIKE` checks if a column matches a specific regular expression pattern.
 * The equivalent function in BigQuery is `REGEXP_CONTAINS`, which supports similar functionality.
 * Note: This transformation assumes `REGEXP_LIKE` is always used with two arguments
 * (column and pattern) only.
 */
class RegexpLikeTransformer extends SqlFunctionTransformer {

  /**
   * This method replace Oracle function by GCP BQ variant in case of customization
   *
   * @param function - the current Sql function
   * @return
   */
  override def transform(function: SqlCall): SqlCall = {
    val args = function.getOperandList

    // Ensure REGEXP_LIKE has exactly 2 arguments
    if (args.size() == 2) {
      val stringExpr = args.get(0) // First argument: column or string
      val regexExpr = args.get(1)  // Second argument: regular expression

      // Transform REGEXP_LIKE to BigQuery REGEXP_CONTAINS
      new SqlBasicCall(
        new SqlFunction(
          "REGEXP_CONTAINS",            // BigQuery function name
          SqlKind.OTHER_FUNCTION,       // Function kind
          null,                         // Return type inference (can be null for simplicity)
          null,                         // Operand type-checker
          null,                         // Operand type inference
          SqlFunctionCategory.STRING    // Function category
        ),
        List(
          stringExpr,                   // Column or string being checked
          SqlLiteral.createCharString(
            regexExpr.toString.stripPrefix("'").stripSuffix("'"), // Process regex string
            SqlParserPos.ZERO
          )                             // Regex as raw literal
        ).asJava,
        function.getParserPosition
      )
    } else {
      // If number of arguments is not 2, return the function unchanged
      function
    }
  }
}
