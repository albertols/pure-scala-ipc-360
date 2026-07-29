package io.pure360.ipc.xmltojson.recipe.transformation

import io.pure360.ipc.model.recipe._
import io.pure360.ipc.xmltojson.recipe.RecipeConstants._
import io.pure360.ipc.xmltojson.recipe.StepMode
import io.pure360.ipc.xmltojson.recipe.expression.{ExpressionParsing, FilterParsing}
import io.pure360.ipc.xmltojson.utils.ExpressionParserUtils.{prepareExpressionString, stripDomainsFromTableNames, uppercaseLogicalOperators}
import io.pure360.ipc.xmltojson.utils.XMLDataUtils._

/**
 * This factory creates instances of [[AbstractTarget]] according to [[StepMode]]
 */
object AbstractTargetFactory extends AbstractItemFactory {

  private val filterConditionExpressionParsing: ExpressionParsing = FilterParsing

  override def createStepItem(stepState: StepState, fields: Option[List[Field]] = None): AbstractTarget = {
    fields match {
      case None => throw new IllegalArgumentException(s"Fields are missing for step target ${stepState.cursor.instance.transformationName}")
      case Some(value) =>
        stepState.stepMode match {
          case StepMode.TARGET => createTableTarget(stepState, value)
          case StepMode.UNION => createUnionTarget(stepState, value)
          case StepMode.SOURCEQUALIFIER => createSourceQualifierTarget(stepState, value)
          case StepMode.FILTER => createFilterTarget(stepState, value)
          case StepMode.JOINER => createJoinerTarget(stepState, value)
          case StepMode.AGGREGATOR => createAggregatorTarget(stepState, value)
          case StepMode.ROUTER => createRouterTarget(stepState, value)
          case StepMode.NORMALIZER => createNormalizerTarget(stepState, value)
          case StepMode.JAVA => createJavaTarget(stepState, value)
          case StepMode.STOREDPROCEDURE => createStoredProcedureTarget(stepState, value)
        }
    }
  }

  private def createTableTarget(stepState: StepState, fields: List[Field]): TableTarget = {
    val targetTable = stepState.cursor.folder.targets.find(_.name == stepState.cursor.instance.transformationName).get
    TableTarget(
      targetTable.name,
      primaryKeys = Option(targetTable
        .targetFields
        .filter(_.keyType.contains(Primary))
        .map(_.name)
        .toList)
          .filter(_.nonEmpty),
      updateOverride = getTableAttributeValue(stepState.cursor.instance, updateOverride)
        .map(prepareExpressionString),
      fields = fields)
  }

  private def createUnionTarget(stepState: StepState, fields: List[Field]): UnionInputTarget = {
    val union = getWithGlobalTransformation(stepState.cursor)
    val inputGroup = union.transformFields.find(_.name == fields.head.name).map(_.group).getOrElse(Undefined)
    UnionInputTarget(inputGroup, fields = fields)
  }

  private def createSourceQualifierTarget(stepState: StepState, fields: List[Field]): SourceQualifierTarget =
    SourceQualifierTarget(
      stepState.cursor.instance.transformationName,
      sourceFilter = getTableAttributeValue(stepState.cursor, SourceFilter)
        .map(prepareExpressionString)
        .map(stripDomainsFromTableNames)
        .map(uppercaseLogicalOperators),
      sqlQuery = getTableAttributeValue(stepState.cursor, SqlQuery)
        .map(prepareExpressionString),
      userDefinedJoin = getTableAttributeValue(stepState.cursor, UserDefinedJoin)
        .map(prepareExpressionString)
        .map(uppercaseLogicalOperators),
      selectDistinct = getTableAttributeValue(stepState.cursor, "Select Distinct").contains("YES"),
      fields = fields)

  private def createFilterTarget(stepState: StepState, fields: List[Field]): FilterTarget =
    FilterTarget(
      getNameWithMapplet(stepState.cursor),
      filterCondition = getTableAttributeValue(stepState.cursor, FilterCondition)
        .map(getFilterConditionTransformation(stepState.cursor, _)),
      fields = fields
    )

  private def createJoinerTarget(stepState: StepState, fields: List[Field]): JoinerTarget = {
    val joiner = getWithGlobalTransformation(stepState.cursor)
    val inputType = joiner
      .transformFields
      .find(_.name == fields.head.name)
      .filter(_.portType.contains(Master))
      .map(_ => Master)
      .getOrElse(Detail)
    JoinerTarget(s"${joiner.name}.$inputType", fields = fields)
  }

  private def createAggregatorTarget(stepState: StepState, fields: List[Field]): AggregatorTarget = {
    val groupByFields = getWithGlobalTransformation(stepState.cursor)
      .transformFields
      .filter(_.expressionType == GroupBy)
      .map(_.name)
      .toList
    AggregatorTarget(
      stepState.cursor.instance.transformationName,
      groupByFields = groupByFields,
      fields = fields
    )
  }

  private def createRouterTarget(stepState: StepState, fields: List[Field]): RouterTarget = {
    val router = getWithGlobalTransformation(stepState.cursor)
    val groups = router.groups
      .filter(_.`type`.contains(Output))
      .map{ group =>
        val groupFields = router
          .transformFields
          .filter(_.portType.contains(Output))
          .filter(_.group == group.name)
          .map{ field =>
            Field(
              field.name,
              mapInformaticaTypetoScalaType(field),
              RecipeTransformationSource(s"${router.name}.${field.refField}")
            )}.toList
        RouterGroup(
          group.name,
          Option(group.expression).filter(_.nonEmpty),
          group.`type`.contains(Default),
          groupFields
        )
      }.toList
    RouterTarget(
      router.name,
      groups = groups,
      fields = fields
    )
  }

  private def createNormalizerTarget(stepState: StepState, fields: List[Field]): NormalizerTarget = {
    val normalizer = getWithGlobalTransformation(stepState.cursor)
    val normalizedFields = normalizer
      .sourceFields
      .map { sourceField =>
        val refSourceFields = normalizer
          .transformFields
          .filter(_.portType.contains(Input))
          .filter(_.refSourceField == sourceField.name)
          .map(_.name)
          .toList
        val generatedKey = sourceField.occurs.toInt > 1 && normalizer
          .transformFields
          .filter(_.portType.contains(GeneratedKey))
          .exists(_.refSourceField == sourceField.name)
        val generatedColumnId = sourceField.occurs.toInt > 1 && normalizer
          .transformFields
          .filter(_.portType.contains(GeneratedColumnId))
          .exists(_.refSourceField == sourceField.name)
        NormalizedField(sourceField.name, refSourceFields, generatedColumnId, generatedKey)
      }.toList

    NormalizerTarget(
      normalizer.name,
      normalizedFields = normalizedFields,
      fields = fields
    )
  }

  private def createJavaTarget(stepState: StepState, fields: List[Field]): JavaTarget =
    JavaTarget(
      stepState.cursor.instance.transformationName,
      javaCode = getMetadataExtensionValue(stepState.cursor, "OnInputRow_Method_Snippet").getOrElse(""),
      fields = fields
    )

  /**
   * This method invokes expression parsing strategy for filter condition string
   *
   * @param cursor - the current cursor
   * @param expression - condition expression string
   * @return - recipe transformation entity
   */
  private def getFilterConditionTransformation(cursor: InstanceCursor, expression: String): RecipeTransformation =
    filterConditionExpressionParsing.parseExpression(cursor, expression)._1

  private def createStoredProcedureTarget(stepState: StepState, fields: List[Field]): StoredProcedureTarget = {
    val transformation = getWithGlobalTransformation(stepState.cursor)
    StoredProcedureTarget(
      transformation.name,
      procedureName = getTableAttributeValue(transformation, "Stored Procedure Name").getOrElse(""),
      returnField = transformation.transformFields.find(_.portType.contains(Return)).map(_.name),
      fields = fields
    )
  }
}
