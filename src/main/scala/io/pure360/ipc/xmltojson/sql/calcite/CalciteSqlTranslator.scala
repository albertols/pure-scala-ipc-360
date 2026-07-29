package io.pure360.ipc.xmltojson.sql.calcite

import io.pure360.ipc.xmltojson.sql.SqlTranslator
import org.apache.calcite.config.Lex
import org.apache.calcite.sql.SqlNode
import org.apache.calcite.sql.dialect.BigQuerySqlDialect
import org.apache.calcite.sql.parser.SqlParser
import org.slf4j.{Logger, LoggerFactory}

import scala.util.{Failure, Success, Try}

/**
 * Implementation of [[SqlTranslator]] based on Apache Calcite library under [[org.apache.calcite]]
 */
object CalciteSqlTranslator extends SqlTranslator {

  val log: Logger = LoggerFactory getLogger getClass.getName

  val config: SqlParser.Config = SqlParser.config().withLex(Lex.ORACLE)

  /**
   * Converts Oracle query string to GCP BQ compatible one
   *
   * @param query - Oracle query string
   * @return - GCP BQ query string
   */
  override def convertOracleToBq(query: String): String = {
    val parser = SqlParser.create(query, config)

    Try {
      // Parse Oracle query to AST
      val sqlNode: SqlNode = parser.parseQuery()
      // Visit and transform SQL using the custom visitor
      val transformedNode = sqlNode.accept(new SqlTransformerVisitor())
      // Convert AST to BigQuery query
      val bigQuerySql = transformedNode.toSqlString(BigQuerySqlDialect.DEFAULT).toString
      bigQuerySql
    } match {
      case Success(value) => value
      case Failure(exception) =>
        log.error(s"Exception during SQL parsing: ${exception.getMessage}")
        ""
    }
  }
}
