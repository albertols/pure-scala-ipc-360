package io.pure360.ipc.xmltojson.sql.calcite

/**
 * Factory for SqlIdentifier transformers.
 *
 * Provides a mapping between Oracle-specific identifiers and their transformers,
 * allowing flexible registration and lookup of transformation logic.
 *
 * For example:
 * SYSDATE -> CURRENT_TIMESTAMP
 */
object SqlIdentifierTransformerFactory {

  private val transformers: Map[String, SqlIdentifierTransformer] = Map(
    "SYSDATE" -> new SysdateTransformer() // Add transformer for SYSDATE
  )

  /**
   * Retrieves the transformer for the given identifier name.
   * Matching is case-insensitive.
   *
   * @param identifierName The name of the identifier (e.g., SYSDATE).
   * @return An optional SqlIdentifierTransformer implementation for the identifier.
   */
  def getTransformer(identifierName: String): Option[SqlIdentifierTransformer] = {
    transformers.get(identifierName.toUpperCase) // Ensure matching is case-insensitive
  }

}
