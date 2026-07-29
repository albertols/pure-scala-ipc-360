package io.pure360.ipc.xmltojson.recipe

import io.pure360.ipc.model.recipe._
import io.pure360.ipc.xmltojson.XmlParserConstants.errorAndControlErrorPattern
import io.pure360.ipc.xmltojson.nodes.AbstractField
import io.pure360.ipc.xmltojson.nodes.Mapplet.{Instance, Mapplet}
import io.pure360.ipc.xmltojson.nodes.Transformation.{TransformField, Transformation}
import io.pure360.ipc.xmltojson.nodes.XMLRoot.Powermart
import io.pure360.ipc.xmltojson.recipe.RecipeConstants._
import io.pure360.ipc.xmltojson.recipe.expression.{ExpressionParsing, TransformationRecursiveParsing}
import io.pure360.ipc.xmltojson.recipe.transformation.{AbstractSourceFactory, AbstractTargetFactory}
import io.pure360.ipc.xmltojson.utils.ExpressionParserUtils.prepareExpressionStringWithoutDomain
import io.pure360.ipc.xmltojson.utils.XMLDataUtils._
import org.slf4j.{Logger, LoggerFactory}

import scala.util.chaining._
import scala.util.matching.compat.RegexOps
import scala.util.{Failure, Success, Try}

/**
 * Methods with logic for composing [[Recipe]] - ETL Recipe, which is presented by List of [[Step]] and general table information.
 * Each [[Step]] consists of a source [[AbstractSource]] and a target [[AbstractTarget]]. Targets and source have their own
 * implementations according to types. The target contains list of [[Field]] with [[RecipeTransformation]], where tree-based process of field transformation is defined
 */
object RecipeGenerator {

  val log: Logger = LoggerFactory getLogger getClass.getName

  // custom type for extract transformation operation
  private type ExtractTransformation = (InstanceCursor, String) => (RecipeTransformation, Option[StepState])

  private val expressionParsing: ExpressionParsing = TransformationRecursiveParsing

  /**
   * This method concerts XML content's bean into ETL Recipe bean
   * @param powermart - input bean with XML content
   * @return - recipe object
   */
  def xmlToTreeEtlRecipe(powermart: Powermart): Recipe = {
    val folder = powermart.repository.folder
    val targetTables = folder.targets.filterNot(target => errorAndControlErrorPattern.matches(target.name))

    // transformation steps
    val stepsUnsorted = targetTables.flatMap(target => {
      val mapping = folder.mappings.head
      val targetInstances = mapping
        .instances
        .filter(_.tType == I_Target)
        .filter(_.transformationName == target.name)

      targetInstances.flatMap { targetInstance =>
        extractSteps(
          extractTransformationsFromInput,
          StepState(StepMode.TARGET, InstanceCursor(folder, mapping, targetInstance)),
          target.targetFields.toList)
      }
    }).distinct.toList
    val steps  = sortStepsTopologically(stepsUnsorted)
    // table section
    val tableSection = RecipeTable(
      getTargetNames(powermart),
      getSourceNames(powermart).toList)

    Recipe(steps, tableSection)
  }

  /**
   * Performs a topological sort on a list of [[Step]] to ensure correct execution order
   * based on their data dependencies. This function starts from target steps of type `table`
   * and traverses upstream dependencies, producing an ordered list from source to target.
   *
   * @param steps The list of ETL [[Step]]
   * @return A list of [[Step]] in sorted order such that:
   *         - All dependencies of a step appear before the step itself.
   * @throws IllegalArgumentException If a circular dependency is detected between steps.
   */
  def sortStepsTopologically(steps: List[Step]): List[Step] = {
    val stepsByTargetName: Map[String, List[Step]] = steps.groupBy(_.target.name)
    val visited = scala.collection.mutable.Set[Step]()
    val result = scala.collection.mutable.ListBuffer[Step]()
    // DFS traversal for topological sorting
    def visit(step: Step, path: Set[Step] = Set.empty): Unit = {
      if (visited.contains(step)) return
      if (path.contains(step)) {
        throw new IllegalArgumentException(s"Circular dependency detected at: ${step.target.name}")
      }
      val newPath = path + step
      for (source <- step.sources) {
        val producers = (source.`type` match {
          case "joiner" => source.asInstanceOf[JoinerSource].joinerTables.flatMap(joinerSrc => stepsByTargetName.getOrElse(joinerSrc, Nil))
          case "union" => source.asInstanceOf[UnionSource].unionTables.flatMap(unionSrc => stepsByTargetName.getOrElse(unionSrc.name, Nil))
          case "table" => Nil
          case _ => stepsByTargetName.getOrElse(source.name, Nil)
        }).filterNot { producer =>
          // Skip back-reference between source and target table if same name in different steps
          producer.target.name == source.name && producer.target.`type`.equalsIgnoreCase("table")
        }
        producers.foreach(p => visit(p, newPath))
      }
      visited += step
      result += step
    }
    // Start traversal from all 'table' type targets for each parallel flow
    val tableSteps = steps.filter(_.target.`type`.equalsIgnoreCase("table"))
    tableSteps.foreach(step => visit(step))
    result.reverse.toList
  }

  /**
   * This recursive method builds up list of recipe steps
   *
   * @param targetStepState - the current step state
   * @param targetFields - the list of step target fields
   * @return - list of steps
   */
  private def extractSteps(extractFunction: ExtractTransformation,
                           targetStepState: StepState,
                           targetFields: List[AbstractField]) : List[Step] = {
    // Get list of fields with transformation and the current step source
    val (recipeFields, sourceStepStateSet) = extractRecipeFields(extractFunction, targetStepState, targetFields)

    // Add additional sources for some targets
    val enrichedSourceStepStateSet = enrichSources(targetStepState, sourceStepStateSet)

    // Save the current step into the list
    val step = List(Step(
      AbstractTargetFactory.createStepItem(targetStepState, Some(recipeFields)),
      enrichedSourceStepStateSet.map(AbstractSourceFactory.createStepItem(_)).toList
    ))

    enrichedSourceStepStateSet.isEmpty match {
      // Orphaned case when there is a target section without any connected sources
      case true => step
      case false =>
        // Depending on the step mode, the algorithm walking stops, splits or continues further
        val sourceStepState = enrichedSourceStepStateSet.head
        sourceStepState.stepMode match {
          case StepMode.SOURCE =>
            // For SOURCE table we stop and returns the current steps
            step
          case StepMode.UNION =>
            // For Union we retrieve input transformed fields for each input group, in such way walking is split into two chains
            step ++ getWithGlobalTransformation(sourceStepState.cursor)
              .transformFields
              .filter(_.portType == Input)
              .groupBy(_.group)
              .values
              .map(_.toList)
              .flatMap(extractSteps(extractTransformationsFromInput, sourceStepState, _))
              .toList
          case StepMode.JOINER =>
            // For Joiner we split transformed fields into Master and Detail groups
            step ++ getWithGlobalTransformation(sourceStepState.cursor)
              .transformFields
              .partition(_.portType.contains(Master))
              .pipe{ case (masterList, detailList) =>
                extractSteps(extractTransformationsFromInput, sourceStepState, masterList.toList) ++
                  extractSteps(extractTransformationsFromInput, sourceStepState, detailList.toList)
              }
          case StepMode.SOURCEQUALIFIER | StepMode.FILTER | StepMode.ROUTER | StepMode.NORMALIZER | StepMode.JAVA | StepMode.STOREDPROCEDURE =>
            // For SourceQualifier, Filter, Router, Normalize, Java we continue walking from Input fields
            step ++ extractSteps(extractTransformationsFromInput, sourceStepState, getWithGlobalTransformation(sourceStepState.cursor)
              .transformFields
              .filter(_.portType.contains(Input))
              .toList)
          case StepMode.AGGREGATOR =>
            // For Aggregator we need to walk from Output fields in order to include new fields with aggregation functions
            step ++ extractSteps(extractTransformationFromOutput, sourceStepState, getWithGlobalTransformation(sourceStepState.cursor)
              .transformFields
              .filter(_.portType.contains(Output))
              .toList)
          case _ =>
            // default case stops and returns the current steps
            step
        }
    }
  }

  private def enrichSources(targetStepState: StepState, sourceStepStateSet: Set[StepState]): Set[StepState] = {
    targetStepState.stepMode match {
      case StepMode.SOURCEQUALIFIER =>
        val sourceFilterSourceSet = getTableAttributeValue(targetStepState.cursor, SourceFilter)
          .map(prepareExpressionStringWithoutDomain)
          .map { queryCondition =>
            FromPattern.findAllMatchIn(queryCondition).map(_.group(1)).toSet
          }.getOrElse(Set.empty[String])
          .map { table =>
            StepState(StepMode.SOURCE, targetStepState.cursor.copy(instance = Instance("", "", "", table.toUpperCase, "", "")))
          }
        sourceStepStateSet ++ sourceFilterSourceSet
      case _ => sourceStepStateSet
    }
  }

  private def extractRecipeFields(extractFunction: ExtractTransformation,
                                  targetStepState: StepState,
                                  targetFields: List[AbstractField]): (List[Field], Set[StepState]) = {
    targetFields.map { field =>
      val (transformation, stepState) = extractFunction(targetStepState.cursor, field.name)
      (Field(field.name, mapTransformationTypeToScalaType(targetStepState.stepMode, field), transformation), stepState)
    }.foldLeft((List.empty[Field], Set.empty[StepState])) {
      case ((fields, stepStateSet), (field, nextStepState)) =>
        (fields :+ field, nextStepState.map(stepStateSet + _).getOrElse(stepStateSet))
    } match {
      case (fields, stepStateSet) if stepStateSet.nonEmpty => (fields, stepStateSet)
      case (fields, _) =>
        targetStepState.stepMode match {
          case StepMode.LOOKUP =>
            log.info(s"Lookup '${targetStepState.cursor.instance.transformationName}' has only scalar/dummy inputs")
          case _ =>
            log.warn(s"No sources are found for target Transformation: " +
              s"instance '${targetStepState.cursor.instance.name}' type '${targetStepState.cursor.instance.transformationType}' " +
              s"name '${targetStepState.cursor.instance.transformationName}''")
        }
        (fields, Set.empty)
    }
  }

  /**
   * This method extracts transformation chain assuming that the income field is with OUTPUT port type. It checks
   * a field's expression value and builds up a chain from it.
   *
   * @param cursor - the current cursor position containing folder, mapping or mapplet and instance
   * @param outputFieldName - the current target field name
   * @return - tuple of recipe transformation abstraction (expression, value, source or lookup) and step state
   */
  private def extractTransformationFromOutput(cursor: InstanceCursor,
                                              outputFieldName: String): (RecipeTransformation, Option[StepState]) = {
    val expression = getWithGlobalTransformation(cursor)
      .transformFields
      .find(_.name == outputFieldName)
      .get
      .expression
    expressionParsing.parseExpression(cursor, expression)
  }

  /**
   * The main recursive method which performs backwards walking algorithm, in case of different transformation type
   * it delegates processing to the appropriate methods. This method assumes that income field is with INPUT port type.
   * To find a chain this method uses connectors between transformation blocks.
   *
   * @param cursor - the current cursor position containing folder, mapping or mapplet and instance
   * @param toFieldFieldName - the current target field name
   * @return - tuple of recipe transformation abstraction (expression, value, source or lookup) and step state
   */
  def extractTransformationsFromInput(cursor: InstanceCursor,
                                              toFieldFieldName: String): (RecipeTransformation, Option[StepState]) = {
    Try {
      getCurrentCursorAndName(cursor, toFieldFieldName) match {
        case Some((currentCursor, currentFieldName)) =>
          // Case when the field has a connected source field
          val transformationName = currentCursor.instance.transformationName
          currentCursor.instance.tType match {
            case I_Mapplet =>
              // If Target connector goes from Mapplet, then step into Mapplet from Mapping
              processMappingToMappletSwitch(currentCursor, currentFieldName)
            case I_Source =>
              // If Source Definition, then stop the tree branch with "leave" source
              (RecipeTransformationSource(s"${transformationName.toUpperCase}.$currentFieldName"),
                Some(StepState(StepMode.SOURCE, currentCursor)))
            case _ =>
              val currentTransformation = getWithGlobalTransformation(currentCursor)
              val outputTransformedField = currentTransformation.transformFields.find(_.name == currentFieldName).get
              (currentTransformation.typ, outputTransformedField.portType) match {
                case (Filter, _) if isFilterNotDq1aOrDq2(currentCursor) =>
                  // Filter case
                  (RecipeTransformationSource(s"${getNameWithMapplet(currentCursor)}.$currentFieldName"),
                    Some(StepState(StepMode.FILTER, currentCursor)))
                case (CustomTransformation, _) if currentTransformation.templateName == UnionTransformation =>
                  // Union case
                  (RecipeTransformationSource(s"$transformationName.$currentFieldName"),
                    Some(StepState(StepMode.UNION, currentCursor)))
                case (CustomTransformation, _) if currentTransformation.templateName == JavaTransformation =>
                  // Java tx case
                  (RecipeTransformationSource(s"$transformationName.$currentFieldName"),
                    Some(StepState(StepMode.JAVA, currentCursor)))
                case (Joiner, _) =>
                  // Joiner case
                  (RecipeTransformationSource(s"$transformationName.$currentFieldName"),
                    Some(StepState(StepMode.JOINER, currentCursor)))
                case (Aggregator, _) =>
                  // Aggregator
                  (RecipeTransformationSource(s"$transformationName.$currentFieldName"),
                    Some(StepState(StepMode.AGGREGATOR, currentCursor)))
                case (SourceQualifier, _) =>
                  // Source Qualifier
                  (RecipeTransformationSource(s"$transformationName.$currentFieldName"),
                    Some(StepState(StepMode.SOURCEQUALIFIER, currentCursor)))
                case (Router, _) =>
                  // Router
                  getRouterTransformationSource(currentCursor, currentFieldName)
                case (Normalizer, _) =>
                  // Normalizer
                  (RecipeTransformationSource(s"$transformationName.$currentFieldName"),
                    Some(StepState(StepMode.NORMALIZER, currentCursor)))
                case (StoredProcedure, _) =>
                  // Stored procedure
                  (RecipeTransformationSource(s"$transformationName.$currentFieldName"),
                    Some(StepState(StepMode.STOREDPROCEDURE, currentCursor)))
                case (_, InputOutput) =>
                  // do nothing pass through
                  extractTransformationsFromInput(currentCursor, currentFieldName)
                case (Expression, Output) if isGlobalTransformation(currentCursor, currentTransformation) =>
                  // Predefined Expression class from the global transformation list
                  processGlobalTransformationExpression(currentCursor, currentTransformation)
                case (Expression, Output) =>
                  // transformation simple expression
                  expressionParsing.parseExpression(currentCursor, outputTransformedField.expression)
                case (InputTransformation, _) =>
                  // input of mapplet flows outside to mapping
                  processMappletToMappingSwitch(currentCursor, currentTransformation, currentFieldName)
                case (Sequence, _) =>
                  // ID sequence generator
                  (RecipeTransformationExpression(SequenceGenerator), None)
                case (LookupProcedure, _) =>
                  // Lookup procedure
                  processLookupTransformation(currentCursor, currentTransformation, outputTransformedField)
                case _ =>
                  // fallback case - pass through
                  extractTransformationsFromInput(currentCursor, currentFieldName)
              }
          }
        case None =>
          // Orphaned case when the field has no source - fill it with NULL
          (RecipeTransformationValue("NULL"), None)
      }
    } match {
      case Success(value) => value
      case Failure(ex) =>
        log.error(s"Exception case toFieldFieldName=$toFieldFieldName, Mapping/Mapplet=${cursor.mappable.name} " +
          s"" +
          s"Instance=${cursor.instance.transformationName}, error: ${ex.getMessage}")
        (RecipeTransformationValue(Undefined), None)
    }
  }

  /**
   * This methods generates the [[RecipeTransformationSource]] for router related field by adding a group name into
   * the source field name, i.e ROUTER_NAME.ROUTER_GROUP_NAME.ROUTER_OUTPUT_FIELD_NAME
   *
   * It also modify the current cursor by adding a group name into the [[io.pure360.ipc.xmltojson.nodes.Mapplet.Instance]]
   * object in the field 'description' in order this value could be used in the next step to generate a source section
   * with router group name
   *
   * @param cursor - the current cursor
   * @param fieldName - the current field name
   * @return - tuple of recipe transformation source and step state
   */
  def getRouterTransformationSource(cursor: InstanceCursor, fieldName: String): (RecipeTransformationSource, Option[StepState]) = {
    val router = getWithGlobalTransformation(cursor)
    val routerGroup = router
      .transformFields
      .filter(_.portType.contains(Output))
      .find(_.name == fieldName)
      .map(_.group)
      .getOrElse("")
    (RecipeTransformationSource(s"${router.name}.$routerGroup.$fieldName"),
      Some(StepState(StepMode.ROUTER, cursor.copy(instance = cursor.instance.copy(description = routerGroup)))))
  }

  /**
   * This method checks whether the current Filter transformation is related to DQ1A or DQ2 checks
   *
   * @param currentCursor - the current cursor object
   * @return - true or false
   */
  def isFilterNotDq1aOrDq2(currentCursor: InstanceCursor): Boolean = {
    val mappable = currentCursor.mappable
    (mappable, mappable.name, currentCursor.instance.transformationName, getTableAttributeValue(currentCursor, FilterCondition)) match {
      case (_: Mapplet, MappletDuplicatedPattern(_*), _, Some(FilterDuplicatedConditionPattern(_*))) => false
      case (_: Mapplet, MappletValidationPattern(_*), _, Some(FilterValidationConditionPattern(_*))) => false
      case (_: Mapplet, _, FilterValidationDq1aPattern(_*), Some(FilterDuplicatedConditionPattern(_*))) => false
      case (_, _, FilterValidationDq1aPattern(_*), Some(FilterValidationConditionPattern(_*))) => false
      case _ => true
    }
  }

  /**
   * This method identifies if there is a connector for the previous field, and returns the current cursor and field name if exists
   *
   * @param instanceCursor - the previous cursor
   * @param toFieldFieldName - the current fild name
   * @return - the current cursor Option
   */
  private def getCurrentCursorAndName(instanceCursor: InstanceCursor,
                                      toFieldFieldName: String): Option[(InstanceCursor, String)] =
  instanceCursor
    .mappable
    .connectors
    .filter(_.toInstance == instanceCursor.instance.name)
    .filter(_.toInstanceType == instanceCursor.instance.transformationType)
    .find(_.toField == toFieldFieldName)
    .map{ connector =>
      val currentInstance = instanceCursor
        .mappable
        .instances
        .filter(_.name == connector.fromInstance)
        .find(_.transformationType == connector.fromInstanceType).head
      val currentFieldName = connector.fromField
      (instanceCursor.copy(instance = currentInstance), currentFieldName)
    }


  /**
   * This method redirects the walking from the mapping to a mapplet
   *
   * @param cursor - the current cursor
   * @param currentFieldName - the current field name
   * @return - tuple of recipe transformation abstraction and step state
   */
  private def processMappingToMappletSwitch(cursor: InstanceCursor,
                                            currentFieldName: String,
                                           ): (RecipeTransformation, Option[StepState]) = {
    //To go to the right mapplet
    val mapplet = cursor.folder.mapplets.filter(_.name.equalsIgnoreCase(cursor.instance.transformationName)).head
    val mappletTransformation = mapplet.transformations.find(_.name == cursor.instance.transformationName).get
    val transformedField = mappletTransformation.transformFields.find(_.name == currentFieldName).get
    val currentTransformation = getWithGlobalTransformation(cursor.folder, mapplet, transformedField.mappletGroup)
    val fromInstance = mapplet.instances.find(_.transformationName == currentTransformation.name).get
    extractTransformationsFromInput(cursor.copy(mappable = mapplet, instance = fromInstance), transformedField.refField)
  }

  /**
   * This method redirects the walking from the mapplet back to the main mapping
   *
   * @param cursor - the current cursor
   * @param currentTransformation - the current transformation
   * @param currentFieldName - the current field name
   * @return - tuple of recipe transformation abstraction and step state
   */
  private def processMappletToMappingSwitch(cursor: InstanceCursor,
                                            currentTransformation: Transformation,
                                            currentFieldName: String
                                           ): (RecipeTransformation, Option[StepState]) = {
    val inputMappletGroup = currentTransformation.name
    val mappletTransformation = getMappletMainTransformation(cursor.mappable)
    val inputTransformedField = mappletTransformation.transformFields
      .filter(_.mappletGroup == inputMappletGroup)
      .filter(_.refField == currentFieldName).head
    val mapping = cursor.folder.mappings.head
    val mappletInstanceInMapping = mapping.instances.find(_.transformationName == mappletTransformation.name).get
    extractTransformationsFromInput(cursor.copy(mappable = mapping, instance = mappletInstanceInMapping), inputTransformedField.name)
  }

  /**
   * This method processes a global reused transformation and return it as a single [[RecipeTransformationExpression]]
   *
   * @param cursor - the current cursor
   * @param currentTransformation - the current transformation
   * @return - tuple of recipe transformation abstraction and step state
   */
  private def processGlobalTransformationExpression(cursor: InstanceCursor,
                                                    currentTransformation: Transformation,
                                                   ): (RecipeTransformation, Option[StepState]) = {
    val inputTransformationAndState = currentTransformation
      .transformFields
      .filter(_.portType.contains(Input))
      .filter(!_.name.contains(FieldName))
      .map(_.name)
      .map(extractTransformationsFromInput(cursor, _))
    val parentTransformationList = inputTransformationAndState.map(_._1).toList
    val stepState = inputTransformationAndState.flatMap(_._2).headOption
    (RecipeTransformationExpression(currentTransformation.name, Some(parentTransformationList)), stepState)
  }


  /**
   * This method is intended to process Lookup Transformation (connected)
   *
   * @param cursor                 - the current cursor
   * @param currentTransformation  - the current transformation
   * @param outputTransformedField - the current transformed field containing expression
   * @return - tuple of recipe transformation abstraction and step state
   */
  private def processLookupTransformation(cursor: InstanceCursor,
                                          currentTransformation: Transformation,
                                          outputTransformedField: TransformField): (RecipeTransformation, Option[StepState]) = {
    val (inputFields, stepStateSet) = extractRecipeFields(
      extractTransformationsFromInput,
      StepState(StepMode.LOOKUP, cursor),
      currentTransformation
        .transformFields
        .filter(_.portType.contains(Input))
        .toList)
    (expressionParsing.buildLookupTransformation(currentTransformation, inputFields, outputTransformedField.name), stepStateSet.headOption)
  }

}