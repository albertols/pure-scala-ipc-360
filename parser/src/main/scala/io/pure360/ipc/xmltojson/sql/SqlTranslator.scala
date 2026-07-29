package io.pure360.ipc.xmltojson.sql

/**
 * The basic trait for SQL-related translation between different SQL dialects
 */
trait SqlTranslator {

  /**
   * Converts Oracle query string to GCP BQ compatible one
   *
   * @param query - Oracle query string
   * @return - GCP BQ query string
   */
  def convertOracleToBq(query: String): String

}
