package io.pure360.ipc.xmltojson.sql.calcite

import org.apache.calcite.sql.{SqlIdentifier, SqlNode}

/**
 * Interface for transforming SqlIdentifier nodes.
 *
 * Implementations of this transformer should provide the logic to transform
 * specific identifiers (e.g., SYSDATE) to their equivalents in the target SQL dialect.
 */
trait SqlIdentifierTransformer {

  /**
   * This method replace Oracle identifier by GCP BQ variant in case of customization
   *
   * @param identifier - the current Sql identifier
   * @return - a transformed Sql node
   */
  def transform(identifier: SqlIdentifier): SqlNode

}
