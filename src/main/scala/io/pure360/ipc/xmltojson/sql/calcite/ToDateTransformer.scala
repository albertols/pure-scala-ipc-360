package io.pure360.ipc.xmltojson.sql.calcite

import io.pure360.ipc.scalamatica.transformation.utils.DateTimeUtils.convertOracleToBqDateTimeFormat
import org.apache.calcite.sql._
import org.apache.calcite.sql.parser.SqlParserPos

import scala.collection.JavaConverters._

/**
 * Transforms Oracle SQL function `TO_DATE` to BigQuery SQL function `PARSE_DATE`.
 *
 * TO_DATE(string_expr, format_string) -> PARSE_DATE(format_string, string_expr)
 *
 * Oracle's `TO_DATE` parses a string expression into a date using a specified format.
 * The equivalent function in BigQuery is `PARSE_DATE`, which can parse a string based on
 * a format string into a date type. This transformation assumes the input always has
 * two arguments: the string expression and the format string.
 */
class ToDateTransformer extends SqlFunctionTransformer {

  /**
   * This method replace Oracle function by GCP BQ variant in case of customization
   *
   * @param function - the current Sql function
   * @return
   */
  override def transform(function: SqlCall): SqlCall = {
    val args = function.getOperandList

    // Ensure the function TO_DATE has exactly 2 arguments
    if (args.size() == 2) {
      val fieldExpr = args.get(0) // The field being transformed (e.g., FIELD in TO_DATE(FIELD, 'YYYYMM'))
      val oracleFormat = args.get(1).toString.stripPrefix("'").stripSuffix("'") // Oracle date format (e.g., 'YYYYMM')

      // Create a call to PARSE_DATE with BigQuery-compatible format
      new SqlBasicCall(
        new SqlFunction(
          "PARSE_DATE",                // BigQuery PARSE_DATE function
          SqlKind.OTHER_FUNCTION,      // Kind of function
          null,                        // Return type inference (not needed here)
          null,                        // Operand type-checker
          null,                        // Operand inference
          SqlFunctionCategory.TIMEDATE // Category: Time/date functions
        ),
        List(
          SqlLiteral.createCharString(convertOracleToBqDateTimeFormat(oracleFormat), SqlParserPos.ZERO), // The BigQuery format string (e.g., '%Y%m')
          fieldExpr                                                      // The field being parsed
        ).asJava,
        function.getParserPosition
      )
    } else {
      // If the number of arguments is not 2, leave the function unchanged
      function
    }
  }
}
