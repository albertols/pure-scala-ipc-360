package io.pure360.ipc.xmltojson.sql.calcite

import org.apache.calcite.sql._
import org.apache.calcite.sql.`type`.SqlTypeName
import org.apache.calcite.sql.fun.SqlStdOperatorTable
import org.apache.calcite.sql.parser.SqlParserPos

import scala.collection.JavaConverters._

/**
 * Transforms Oracle SQL function `TO_NUMBER` to BigQuery SQL function `CAST` with NUMERIC type.
 *
 * TO_NUMBER(expr) -> CAST(expr AS NUMERIC)
 *
 * Oracle's `TO_NUMBER` converts an expression into a numeric type. In BigQuery, the equivalent
 * transformation uses `CAST` with the NUMERIC type, which provides high precision and scale.
 * This transformation assumes that `TO_NUMBER` always has exactly one argument.
 */
class ToNumberTransformer extends SqlFunctionTransformer {

  /**
   * This method replace Oracle function by GCP BQ variant in case of customization
   *
   * @param function - the current Sql function
   * @return
   */
  override def transform(function: SqlCall): SqlCall = {
    val args = function.getOperandList

    // Ensure TO_NUMBER has exactly one argument
    if (args.size() == 1) {
      val expr = args.get(0) // The expression being casted to NUMERIC

      // Create a CAST SQL expression with NUMERIC type
      new SqlBasicCall(
        SqlStdOperatorTable.CAST,       // CAST operator
        List(
          expr,                         // The field/expression to cast
          new SqlDataTypeSpec(
            new SqlAlienSystemTypeNameSpec(
              "NUMERIC",                // BigQuery's type alias
              SqlTypeName.DECIMAL,      // The SqlTypeName corresponding to NUMERIC
              SqlParserPos.ZERO         // Position in the SQL query
            ),
            SqlParserPos.ZERO           // Position of the SqlDataTypeSpec
          )
        ).asJava,
        function.getParserPosition       // Preserve the original position in the SQL query
      )
    } else {
      // If the argument count is not 1, return the function unchanged
      function
    }
  }
}
