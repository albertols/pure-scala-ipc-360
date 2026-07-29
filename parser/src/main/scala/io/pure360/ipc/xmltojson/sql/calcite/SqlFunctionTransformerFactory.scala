package io.pure360.ipc.xmltojson.sql.calcite

/**
 * Factory to fetch the appropriate transformer for a given SQL function
 */
object SqlFunctionTransformerFactory {

  private val transformers: Map[String, SqlFunctionTransformer] = Map(
    "TO_CHAR" -> new ToCharTransformer(),
    "TO_DATE" -> new ToDateTransformer(),
    "TO_NUMBER" -> new ToNumberTransformer(),
    "REGEXP_LIKE" -> new RegexpLikeTransformer(),
    "NVL" -> new NvlTransformer(),
    "TRUNC" -> new TruncTransformer()
  )

  // Return the transformer based on the SQL function name
  def getTransformer(functionName: String): Option[SqlFunctionTransformer] = {
    transformers.get(functionName.toUpperCase)
  }

}
