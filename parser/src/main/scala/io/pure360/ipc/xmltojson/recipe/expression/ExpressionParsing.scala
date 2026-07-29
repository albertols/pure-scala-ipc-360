package io.pure360.ipc.xmltojson.recipe.expression

import io.pure360.ipc.model.enums.LookupMatchType
import io.pure360.ipc.model.recipe._
import io.pure360.ipc.xmltojson.nodes.Transformation.Transformation
import io.pure360.ipc.xmltojson.recipe.RecipeConstants._
import io.pure360.ipc.xmltojson.recipe.StepMode
import io.pure360.ipc.xmltojson.utils.ExpressionParserUtils._
import io.pure360.ipc.xmltojson.utils.XMLDataUtils.{getTableAttributeValue, getWithGlobalTransformation, mapTransformationTypeToScalaType}
import org.slf4j.{Logger, LoggerFactory}

/**
 * This trait contains the core of expression parsing functionality
 */
trait ExpressionParsing {

  def logger: Logger = LoggerFactory getLogger getClass.getName

  /**
   * This method processes the input field name
   *
   * @param cursor - the current cursor
   * @param fieldName - the current field name
   * @return - tuple of recipe transformation abstraction and step state
   */
  def processInputField(cursor: InstanceCursor, fieldName: String): (RecipeTransformation, Option[StepState])

  /**
   * This method processes ta single expression content
   *
   * @param cursor - the current cursor
   * @param expression - expression string
   * @return - tuple of recipe transformation abstraction and step state
   */
  def parseExpression(cursor: InstanceCursor,
                      expression: String
                     ): (RecipeTransformation, Option[StepState]) = {
    parseCleanedExpression(cursor, prepareExpressionString(expression))
  }

  /**
   * This method performs "preprocessing" of incoming expression string, i.e. deleting head/tail spaces and brackets
   *
   * @param expression - expression string
   * @return - processed expression
   */
  def filterParenthesis(expression: String): String = {
    expression.trim match {
      case ParenthesisPattern(_) => extractOuterParenthesesContent(expression.trim)
      case normal => normal
    }
  }

  /**
   * This method builds RecipeTransformationLookup object
   *
   * @param transformation - lookup transformation
   * @param inputFields - list of input fields
   * @param outputField - output (return) field name
   * @return - recipe transformation referring to lookup
   */
  def buildLookupTransformation(transformation: Transformation, inputFields: List[Field], outputField: String): RecipeTransformationLookup = {
    RecipeTransformationLookup(
      name = transformation.name,
      outputField = outputField,
      table = getTableAttributeValue(transformation, "Lookup table name"),
      condition = getTableAttributeValue(transformation, LookupCondition).map(prepareExpressionString),
      sourceFilter = getTableAttributeValue(transformation, LookupSourceFilter).map(prepareExpressionStringWithoutDomain),
      sqlOverride = getTableAttributeValue(transformation, LookupSqlOverride).map(prepareExpressionString),
      matchPolicy = getTableAttributeValue(transformation, "Lookup policy on multiple match").map(LookupMatchType.apply).getOrElse(LookupMatchType.First),
      parameters = inputFields
    )
  }

  /**
   * This recursive method is intended to parse simple expression string and in case of nested expressions to invoke the next
   * recursive call
   *
   * @param cursor - the current cursor
   * @param expression - string expression
   * @return - tuple of recipe transformation abstraction and step state
   */
  private def parseCleanedExpression(cursor: InstanceCursor,
                                     expression: String
                                      ): (RecipeTransformation, Option[StepState]) = {
    filterParenthesis(expression) match {
      case CaseInsensitiveSysdate() =>
        // System date function
        (RecipeTransformationExpression("EXP_GET_SYSTEM_DATE"), None)
      case LookupProcedurePattern(func, params) =>
        // Unconnected Lookups
        parseInlineLookupProcedure(cursor, func, params)
      case stringConcatPattern if identifyOperator(stringConcatPattern, StringOperators).isDefined =>
        // String operator ||
        val (operand1, _, operand2) = identifyOperator(stringConcatPattern, StringOperators).get
        val nestedResults = processNestedExpressions(cursor, operand1, operand2)
        (RecipeTransformationExpression("EXP_CONCAT", Some(nestedResults._1)), nestedResults._2)
      case arithmeticPattern if identifyOperator(arithmeticPattern, ArithmeticOperators).isDefined =>
        // Arithmetic operations +-/*
        val (operand1, operator, operand2) = identifyOperator(arithmeticPattern, ArithmeticOperators).get
        val operand1Result = parseCleanedExpression(cursor, operand1)
        val operand2Result = parseCleanedExpression(cursor, operand2)
        (RecipeTransformationExpression("EXP_ARITHMETIC",
          Some(List(operand1Result._1, RecipeTransformationValue(operator), operand2Result._1))),
          operand1Result._2.orElse(operand2Result._2))
      case logicalPattern if identifyOperator(logicalPattern, LogicalOperators).isDefined =>
        // Logical operations AND, OR
        val (operand1, operator, operand2) = identifyOperator(logicalPattern, LogicalOperators).get
        val operand1Result = parseCleanedExpression(cursor, operand1)
        val operand2Result = parseCleanedExpression(cursor, operand2)
        (RecipeTransformationExpression("EXP_LOGICAL",
          Some(List(operand1Result._1, RecipeTransformationValue(operator), operand2Result._1))),
          operand1Result._2.orElse(operand2Result._2))
      case comparisonPattern if identifyOperator(comparisonPattern, ComparisonOperators).isDefined =>
        // Comparison operations >=, <=, ...
        val (operand1, operator, operand2) = identifyOperator(comparisonPattern, ComparisonOperators).get
        val operand1Result = parseCleanedExpression(cursor, operand1)
        val operand2Result = parseCleanedExpression(cursor, operand2)
        (RecipeTransformationExpression("EXP_COMPARISON",
          Some(List(operand1Result._1, RecipeTransformationValue(operator), operand2Result._1))),
          operand1Result._2.orElse(operand2Result._2))
      case NegativePattern(_, operand) =>
        val operandResult = parseCleanedExpression(cursor, operand)
        (RecipeTransformationExpression("EXP_NOT", Some(List(operandResult._1))), operandResult._2)
      case FunctionPattern(func, params) if PredefinedFunctions.contains(func.toUpperCase) =>
        // Predefined functions: LPAD( first_string, length [,second_string] ), TO_CHAR( date [,format] ), TO_INTEGER
        val nestedParameters = splitParametersWithNestedFunction(params)
        val nestedResults = processNestedExpressions(cursor, nestedParameters: _*)
        (RecipeTransformationExpression(s"EXP_${func.toUpperCase}", Some(nestedResults._1)), nestedResults._2)
      case FunctionPattern(func, params) if func.toUpperCase.contains("TRIM") =>
        // Function LTRIM or RTRIM, in Scala we need to have one trim
        val nestedResult = parseCleanedExpression(cursor, params)
        if (checkNestedTrimExpression(nestedResult._1)) {
          nestedResult
        } else {
          (RecipeTransformationExpression("EXP_TRIM", Some(List(nestedResult._1))), nestedResult._2)
        }
      case FunctionPattern(func, params) =>
        // Undefined function, which requires to be classified
        val nestedParameters = splitParametersWithNestedFunction(params)
        val nestedResults = processNestedExpressions(cursor, nestedParameters: _*)
        logger.error(s"Undefined function found: $func")
        (RecipeTransformationExpression(Undefined, Some(nestedResults._1)), nestedResults._2)
      case inputFieldName =>
        // case when expression contains either the input field reference or static value
        processStringValue(cursor, inputFieldName)
    }
  }

  /**
   * This method processes set of nested expressions and return them as a list of transformations
   *
   * @param cursor - the current cursor
   * @param expressions - array of expressions
   * @return - tuple of recipe transformation list and step state
   */
  private def processNestedExpressions(cursor: InstanceCursor,
                                       expressions: String*): (List[RecipeTransformation], Option[StepState]) = {
    val nestedResults = expressions.map(parseCleanedExpression(cursor, _))
    val transformationList = nestedResults.map(_._1).toList
    val stepSource = nestedResults.flatMap(_._2).headOption
    (transformationList, stepSource)
  }

  /**
   * This method is intended to process inline (unconnected) llokup procedure, like
   * expression = ":LKP.NAME_OF_LOOKUP(FIELD1, VALUE1, ....)"
   *
   * @param cursor - the current cursor
   * @param name - name of lookup transformation instance
   * @param params - lookup input parameters
   * @return - tuple of recipe transformation abstraction and step state
   */
  private def parseInlineLookupProcedure(cursor: InstanceCursor,
                                         name: String,
                                         params: String): (RecipeTransformation, Option[StepState]) = {
    val nestedResults = processNestedExpressions(cursor, splitParametersWithNestedFunction(params): _*)
    val lookupInstance = cursor.mappable.instances.find(_.name == name).get
    val lookupTransformation = getWithGlobalTransformation(cursor.folder, cursor.mappable, lookupInstance.transformationName)

    // get input fields from list of transformation and input ports to lookup
    val inputFields = (nestedResults._1 zip lookupTransformation.transformFields.filter(_.portType.contains(Input)))
      .map{ case (recipeTransformation, transformedField) =>
        Field(transformedField.name, mapTransformationTypeToScalaType(StepMode.LOOKUP, transformedField), recipeTransformation)
      }
    val outputField = lookupTransformation.transformFields.find(_.portType.contains(Return)).map(_.name).getOrElse("")

    (buildLookupTransformation(lookupTransformation, inputFields, outputField), nestedResults._2)
  }

  /**
   * This method checks whether the current transformation is an expression and equals to EXP_TRIM
   *
   * @param transformation - the current recipe transformation abstraction
   * @return - true or false
   */
  private def checkNestedTrimExpression(transformation: RecipeTransformation): Boolean =
    (transformation.isInstanceOf[RecipeTransformationExpression]
      && transformation.asInstanceOf[RecipeTransformationExpression].name.equals("EXP_TRIM"))

  /**
   * This method processes the input field value from the current expression and identifies whether it is a local variable,
   * or input transformed field or a static value
   *
   * @param cursor - the current cursor
   * @param inputFieldName - the current input name
   * @return - tuple of recipe transformation abstraction and step state
   */
  private def processStringValue(cursor: InstanceCursor,
                                 inputFieldName: String): (RecipeTransformation, Option[StepState]) = {
    val transformation = getWithGlobalTransformation(cursor)
    val inputTransformFieldOption = transformation.transformFields.find(_.name == getPureFieldName(inputFieldName))
    inputTransformFieldOption match {
      case Some(inputTransformField) =>
        inputTransformField.portType match {
          // If the current input transformField is "LOCAL VARIABLE", we need to process its expression too
          // Otherwise go outside the current simple expression and continue recursive walking
          case LocalVariable => parseExpression(cursor, inputTransformField.expression)
          case _ => processInputField(cursor, inputFieldName)
        }
      case None =>
        // If the field value doesn't refer to any field names, then it is a static value
        (RecipeTransformationValue(inputFieldName), None)
    }
  }

}
