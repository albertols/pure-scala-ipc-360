package io.pure360.ipc.xmltojson.utils

import io.pure360.ipc.xmltojson.recipe.RecipeConstants.{FromPattern, JoinPattern, TableFieldPattern}

import scala.collection.mutable
import scala.collection.mutable.ListBuffer

/**
 * This class contains methods aided for expression string parsing
 */
object ExpressionParserUtils {

  /**
   * This method identifies given operations and returns its parts
   * String literals are taken into account
   * LENGTH(TO_CHAR(FIELD))-2 - this is a valid case returns as operand1 = LENGTH(TO_CHAR(FIELD)), operator = "-", operand2 = 2
   * TO_CHAR(FIELD,'YYYY-MM-DD') - this is not a valid case due to enclosing string literal
   *
   * @param input - expression string
   * @param operators - list of operators to identify
   * @return - tuple of operand1, operator, operand2
   */
  def identifyOperator(input: String, operators: List[String]): Option[(String, String, String)] = {
    var operatorIndex = -1
    var operator = ""

    for (operation <- operators; if operatorIndex == -1) {
      var withinQuotes = false
      var index = 0
      val stack = mutable.Stack[Char]()
      while (index < input.length - operation.length + 1 && operatorIndex == -1) {
        val ch = input(index)
        ch match {
          case '\'' => withinQuotes = !withinQuotes
          case '(' if !withinQuotes => stack.push(ch)
          case ')' if !withinQuotes && stack.nonEmpty => stack.pop()
          case _ if input.startsWith(operation, index) && !withinQuotes && stack.isEmpty =>
            operatorIndex = index
            index = input.length
            operator = operation
          case _ =>
        }
        index += 1
      }
    }

    if (operatorIndex > 0) {
      val operand1 = input.substring(0, operatorIndex).trim
      val operand2 = input.substring(operatorIndex + operator.length).trim
      Some(operand1, operator.trim, operand2)
    } else {
      None
    }
  }

  /**
   * This method splits function parameters by comma taking into account brackets and string literals
   * TO_CHAR(FIELD,'YYYY-MM-DD'),'YYYY-MM-DD' => List of TO_CHAR(FIELD,'YYYY-MM-DD') and 'YYYY-MM-DD'
   * TO_CHAR(FIELD),1,LENGTH(TO_CHAR(FIELD))-2 => List of TO_CHAR(FIELD) and 1 and LENGTH(TO_CHAR(FIELD))-2
   *
   * @param input - parameters string
   * @param delimiter - delimiter string
   * @param isTrimmed - flag whether it requires to trim parameter elements
   * @return list of parameters
   */
  def splitParametersWithNestedFunction(input: String, delimiter: String, isTrimmed: Boolean): List[String] = {
    val args = ListBuffer[String]()
    val stack = mutable.Stack[Char]()
    var arg = ""
    var inString = false
    var index = 0

    while (index < input.length) {
      val ch = input(index)
      ch match {
        case '\'' => inString = !inString
        case '(' if !inString => stack.push(ch)
        case ')' if !inString && stack.nonEmpty => stack.pop()
        case _ =>
      }
      ch match {
        case _ if input.startsWith(delimiter, index) && !inString && stack.isEmpty =>
          args.append(if (isTrimmed) arg.trim else arg)
          arg = ""
          index += delimiter.length
        case _ =>
          arg += ch
          index += 1
      }
    }
    args.append(if (isTrimmed) arg.trim else arg)
    args.toList
  }

  /**
   * Default case for the method [[splitParametersWithNestedFunction(input: String, delimiter: Char)]]. The delimiter is ','
   *
   * @param input - parameters string
   * @return list of parameters
   */
  def splitParametersWithNestedFunction(input: String): List[String] = splitParametersWithNestedFunction(input, ",", isTrimmed = true)

  /**
   * This method extracts the content inside brackets in case these bracket are outer
   *
   * @param input - input string with leading and tailing brackets, i.e. '(FIELD)' or '(FIELD = 0) OR (FIELD = 1)'
   * @return - extracted content
   */
  def extractOuterParenthesesContent(input: String): String = {
    var inString = false
    val stack = mutable.Stack[Char]()

    for (index <- 1 until input.length - 1) {
      val token = input(index)
      token match {
        case '\'' => inString = !inString
        case '(' if !inString => stack.push(token)
        case ')' if !inString && stack.nonEmpty => stack.pop()
        case _ =>
      }
    }

    if (stack.isEmpty)
      input.substring(1, input.length - 1).trim
    else
      input
  }

  /**
   * This method removed control symbols and redundant spaces:
   * - Commented lines
   * - Control characters,
   * - Leading and tailing spaces
   *
   * @param expression - raw string expression
   * @return - cleaned expression
   */
  def prepareExpressionString(expression: String): String = {
    expression
      // Remove multi-line comments /* ... */
      .replaceAll("(?s)/\\*.*?\\*/", "")
      // Remove single-line comments starting with -- or //
      .replaceAll("(--|//).*", "")
      // Replace all whitespace characters, line breaks, tabs, and non-breaking spaces with a single space
      .replaceAll("[\\s\\r\\n\\t\\u00A0]+", " ")
      // Trim leading and trailing whitespace
      .trim
  }

  /**
   * This method removed control symbols and redundant spaces:
   * - Commented lines
   * - Control characters,
   * - Leading and tailing spaces
   * - In addition, remove domain from fields name
   *
   * @param expression - raw string expression
   * @return - cleaned expression
   */
  def prepareExpressionStringWithoutDomain(expression: String): String =
    TableFieldPattern.replaceAllIn(prepareExpressionString(expression), m => m.group(2))

  /**
   * Removes domain/schema prefixes from table names in SQL expressions,
   * but only in the context of FROM and JOIN clauses.
   *
   * For example:
   * - "FROM db1.table1" becomes "FROM table1"
   * - "JOIN db2.table2" becomes "JOIN table2"
   *
   * @param sql the input SQL string
   * @return the SQL string with domains removed from table names
   */
  def stripDomainsFromTableNames(sql: String): String = {
    // Replace domains in FROM clause
    val sqlWithoutFromDomains = FromPattern.replaceAllIn(sql, m => {
      val tables = m.group(1)
        .split(",")
        .map(_.trim.split('.').last) // Take table name only
        .mkString(", ")
      s"FROM $tables"
    })

    // Replace domains in JOIN clause
    val sqlWithoutJoinDomains = JoinPattern.replaceAllIn(sqlWithoutFromDomains, m => {
      val table = m.group(1).trim.split('.').last
      s"JOIN $table"
    })

    sqlWithoutJoinDomains
  }


  /**
   * Converts logical operators 'and' and 'or' to uppercase 'AND' and 'OR',
   * only when they appear as standalone words (not part of other words).
   *
   * @param expr the input SQL expression or condition string
   * @return the transformed string with AND/OR uppercased
   */
  def uppercaseLogicalOperators(expr: String): String = {
    expr
      .replaceAll("\\b(?i)and\\b", "AND")
      .replaceAll("\\b(?i)or\\b", "OR")
  }

  /**
   * Strips any qualifier prefix from a field name, keeping the part after the last dot.
   *
   * @param fieldName possibly qualified field name (e.g. "dataset.table.FIELD")
   * @return the unqualified field name
   */
  def getPureFieldName(fieldName: String): String = {
    val index = fieldName.lastIndexOf('.')
    if (index != -1) fieldName.substring(index + 1) else fieldName
  }
}
