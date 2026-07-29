package io.pure360.ipc.xmltojson.sql.calcite

import org.apache.calcite.sql.SqlCall

/**
 * Interface for SQL function transformers
 */
trait SqlFunctionTransformer {

  /**
   * This method replace Oracle function by GCP BQ variant in case of customization
   *
   * @param function - the current Sql function
   * @return - a transformed Sql function
   */
  def transform(function: SqlCall): SqlCall

}
