package io.pure360.ipc.xmltojson.sql

import io.pure360.ipc.xmltojson.sql.calcite.CalciteSqlTranslator
import io.pure360.ipc.xmltojson.sql.sqlglot.SqlGlotSqlTranslator


object SqlTranslatorFactory {

  private val translators: Map[String, SqlTranslator] = Map(
    "default" -> CalciteSqlTranslator,
    "calcite" -> CalciteSqlTranslator,
    "sqlglot" -> SqlGlotSqlTranslator
  )

  // Return the SQL Translator based on the SQL function name
  def getSqlTranslator(engineName: String): Option[SqlTranslator] = {
    translators.get(engineName)
  }

}
