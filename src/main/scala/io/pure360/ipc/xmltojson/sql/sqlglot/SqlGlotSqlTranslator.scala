package io.pure360.ipc.xmltojson.sql.sqlglot

import io.pure360.ipc.xmltojson.sql.SqlTranslator
//import jep.SharedInterpreter
//import me.shadaj.scalapy._
//import me.shadaj.scalapy.py
//import me.shadaj.scalapy.py.PyQuote
//import me.shadaj.scalapy.py.SeqConverters
//import me.shadaj.scalapy.py.Dynamic.global
//import jep.Jep
import org.slf4j.{Logger, LoggerFactory}


/**
 * Implementation of [[SqlTranslator]] based on SQLGlot project https://github.com/tobymao/sqlglot
 */
object SqlGlotSqlTranslator extends SqlTranslator {

  val log: Logger = LoggerFactory getLogger getClass.getName

  /**
   * Converts Oracle query string to GCP BQ compatible one
   *
   * @param query - Oracle query string
   * @return - GCP BQ query string
   */
  override def convertOracleToBq(query: String): String = ???

  def main(args: Array[String]): Unit = {

    /*val jep = new SharedInterpreter()
    jep.eval("import sqlglot")
    jep.eval("""result = sqlglot.transpile("SELECT EPOCH_MS(1618088028295)", read="duckdb", write="hive")[0]""")
    val transpiled = jep.getValue("result", classOf[String])
    println(transpiled)
    jep.close()*/

    /*val dictPython = py.Dynamic.global.dict(Map("India" -> "New Delhi", "Germany" -> "Berlin"))
    val cap = dictPython.get("India")

    println("Capital of India is: " + cap)

    val listLengthPython = py.Dynamic.global.len(List(1, 2, 3).toPythonProxy)
    val listLength = listLengthPython.as[Int]*/

/*    val sqlglot = py.module("sqlglot")

    // Oracle SQL query
    val oracleQuery =
      """
      SELECT TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS') AS formatted_date,
             NVL(column_name, 'default') AS column_value,
             REGEXP_LIKE(name, '^[a-z]+$') AS name_match
      FROM my_table
      """

    val transpiledQuery = sqlglot.transpile(
      oracleQuery,
      Map("read" -> "duckdb", "write" -> "hive")
    )

    val outputQuery = transpiledQuery.as[List[String]].mkString("\n")
    println(s"Transpiled SQL: \n$outputQuery")*/
  }
}
