package io.pure360.ipc.xmltojson.recipe.transformation

import io.pure360.ipc.model.recipe._
import io.pure360.ipc.xmltojson.recipe.RecipeConstants.{Detail, Input, Master, Primary, SourceDefinition}
import io.pure360.ipc.xmltojson.recipe.StepMode
import io.pure360.ipc.xmltojson.utils.XMLDataUtils.{getNameWithMapplet, getTableAttributeValue, getWithGlobalTransformation}

/**
 * This factory creates instances of [[AbstractSource]] according to [[StepMode]]
 */
object AbstractSourceFactory extends AbstractItemFactory {

  override def createStepItem(stepState: StepState, fields: Option[List[Field]] = None): AbstractSource = {
    stepState.stepMode match {
      case StepMode.SOURCE => createTableSource(stepState)
      case StepMode.UNION => createUnionSource(stepState)
      case StepMode.SOURCEQUALIFIER => createSourceQualifierSource(stepState)
      case StepMode.FILTER => createFilterSource(stepState)
      case StepMode.JOINER => createJoinerSource(stepState)
      case StepMode.AGGREGATOR => createAggregatorSource(stepState)
      case StepMode.ROUTER => createRouterSource(stepState)
      case StepMode.NORMALIZER => createNormalizerSource(stepState)
      case StepMode.JAVA => createJavaSource(stepState)
      case StepMode.STOREDPROCEDURE => createStoredProcedureSource(stepState)
    }
  }

  private def createTableSource(stepState: StepState): TableSource = {
    val sourceTableOpt = stepState.cursor.folder.sources.find(_.name == stepState.cursor.instance.transformationName)
    sourceTableOpt match {
      case Some(sourceTable) =>
        TableSource(
          sourceTable.name,
          primaryKeys = Option(sourceTable
            .sourceFields
            .filter(_.keyType.contains(Primary))
            .map(_.name)
            .toList)
            .filter(_.nonEmpty))
      case None =>
        TableSource(stepState.cursor.instance.transformationName)
    }
  }

  private def createUnionSource(stepState: StepState): UnionSource = {
    val unionTransformation = getWithGlobalTransformation(stepState.cursor)
    val unionInputs = unionTransformation
      .groups
      .filter(_.`type` == Input)
      .map(_.name)
      .toList
    val unionTables = unionInputs.map { unionInput =>
      val fieldMapping = unionTransformation
        .transformFields
        .filter(_.group == unionInput)
        .map(_.name)
        .map { originField =>
          val unionField = unionTransformation
            .fieldDependencies
            .find(_.inputField == originField)
            .map(_.outputField)
            .getOrElse(originField)
          FieldMap(originField, unionField)
        }.toList
      UnionTable(unionInput, fieldMapping)
    }
    UnionSource(stepState.cursor.instance.transformationName, unionTables = unionTables)
  }

  private def createSourceQualifierSource(stepState: StepState): SourceQualifierSource =
    SourceQualifierSource(stepState.cursor.instance.transformationName)

  private def createFilterSource(stepState: StepState): FilterSource = FilterSource(getNameWithMapplet(stepState.cursor))

  private def createJoinerSource(stepState: StepState): JoinerSource = {
    val joinerName = stepState.cursor.instance.transformationName
    JoinerSource(
      joinerName,
      joinerTables = List(s"$joinerName.$Master", s"$joinerName.$Detail"),
      joinerType = getTableAttributeValue(stepState.cursor, "Join Type").getOrElse(""),
      joinerCondition = getTableAttributeValue(stepState.cursor, "Join Condition").getOrElse(""))
  }

  private def createAggregatorSource(stepState: StepState): AggregatorSource =
    AggregatorSource(stepState.cursor.instance.transformationName)

  private def createRouterSource(stepState: StepState): RouterSource =
    RouterSource(
      name = stepState.cursor.instance.transformationName,
      group = stepState.cursor.instance.description)

  private def createNormalizerSource(stepState: StepState): NormalizerSource =
    NormalizerSource(stepState.cursor.instance.transformationName)

  private def createJavaSource(stepState: StepState): JavaSource = JavaSource(stepState.cursor.instance.transformationName)

  private def createStoredProcedureSource(stepState: StepState): StoredProcedureSource =
    StoredProcedureSource(stepState.cursor.instance.transformationName)
}
