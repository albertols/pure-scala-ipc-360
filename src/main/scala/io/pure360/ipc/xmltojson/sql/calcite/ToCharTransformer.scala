package io.pure360.ipc.xmltojson.sql.calcite

import io.pure360.ipc.scalamatica.transformation.utils.DateTimeUtils.convertOracleToBqDateTimeFormat
import org.apache.calcite.sql._
import org.apache.calcite.sql.`type`.SqlTypeName
import org.apache.calcite.sql.fun.SqlStdOperatorTable
import org.apache.calcite.sql.parser.SqlParserPos

import scala.collection.JavaConverters._

/**
 * Transforms Oracle SQL function `TO_CHAR` to BigQuery SQL functions `FORMAT_DATE` or `CAST`,
 * depending on the provided arguments.
 *
 * TO_CHAR(date_expr, format_string) -> FORMAT_DATE(format_string, date_expr)
 * TO_CHAR(expr)                     -> CAST(expr AS STRING)
 *
 * Oracle's `TO_CHAR` function formats date expressions into strings using a specified format.
 * In BigQuery, equivalent formatting is handled by `FORMAT_DATE`. If no format string is
 * provided, the transformation uses `CAST` to convert the expression to a `STRING`.
 */
class ToCharTransformer extends SqlFunctionTransformer {

  /**
   * This method replace Oracle function by GCP BQ variant in case of customization
   *
   * @param function - the current Sql function
   * @return
   */
  override def transform(function: SqlCall): SqlCall = {
    val args = function.getOperandList
    args.size match {
      case 2 =>
        // Case 1: FORMAT_DATE(format_string, date_expr)
        val dateExpr = args.get(0) // First argument is the date expression
        val formatString = args.get(1).toString.stripPrefix("'").stripSuffix("'") // Strip quotes from format string

        // Create a FORMAT_DATE SQL call
        new SqlBasicCall(
          new SqlFunction(
            "FORMAT_DATE",                // The BigQuery function to use
            SqlKind.OTHER_FUNCTION,       // Function kind
            null,                         // Return type inference
            null,                         // Operand type inference
            null,                         // Operand type checker
            SqlFunctionCategory.STRING    // Function category
          ),
          List(
            SqlLiteral.createCharString(convertOracleToBqDateTimeFormat(formatString), SqlParserPos.ZERO), // Use factory method for string literal
            dateExpr                                                    // Date expression
          ).asJava,
          function.getParserPosition
        )
      case 1 =>
        // Case 2: CAST(arg AS STRING)
        val expr = args.get(0) // First argument is the expression we want to CAST

        // Create the target type specification for STRING
        val typeNameSpec = new SqlAlienSystemTypeNameSpec(
          "STRING",           // Set manually "STRING" for BigQuery
          SqlTypeName.VARCHAR, // Use VARCHAR since STRING has no internal SqlTypeName
          SqlParserPos.ZERO    // Position in the SQL
        )

        // Create CAST expression
        new SqlBasicCall(
          SqlStdOperatorTable.CAST, // CAST operator
          List(
            expr,                   // The expression to cast
            new SqlDataTypeSpec(    // Data type specification (target type: STRING/VARCHAR)
              typeNameSpec,         // Type name specification
              SqlParserPos.ZERO     // Position of the data type in SQL (can be zeroed)
            )
          ).asJava,
          function.getParserPosition
        )
      case _ => function
    }
  }
}
