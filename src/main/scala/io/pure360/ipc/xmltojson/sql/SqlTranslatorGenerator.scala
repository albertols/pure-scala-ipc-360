package io.pure360.ipc.xmltojson.sql

import io.circe.parser.decode
import io.pure360.ipc.model.sql.{SqlContent, TransformationContent}
import io.pure360.ipc.xmltojson.XmlParserConstants._
import io.pure360.ipc.xmltojson.nodes.XMLRoot.Powermart
import io.pure360.ipc.xmltojson.recipe.RecipeConstants._
import io.pure360.ipc.xmltojson.utils.ExpressionParserUtils.prepareExpressionString
import io.pure360.ipc.xmltojson.utils.XMLDataUtils.getTableAttributeValue
import org.slf4j.{Logger, LoggerFactory}

import scala.util.{Failure, Success, Try}

/**
 * The basic object to generate SQL content translation
 *
 * input: [[Powermart]] object
 * output: SqlContent object ready to be saved into _sqlTranslation_ETL_....json
 */
object SqlTranslatorGenerator {

  val log: Logger = LoggerFactory getLogger getClass.getName
  private val manualSqlTranslationsFile = "src/main/resources/xmltobq/_sqlTranslations_manual.json"
  private lazy val manualSqlContent: Map[String, String] = getManualSqlContent(manualSqlTranslationsFile)

  /**
   * Loads the optional manual SQL translations file (mappingName.transformationName -> translated sql)
   *
   * @param contentPath - path to the manual translations json
   * @return - the parsed map, or an empty map when the file is missing or unparsable
   */
  private def getManualSqlContent(contentPath: String): Map[String, String] = {
    Try {
      val source = scala.io.Source.fromFile(contentPath)
      try decode[Map[String, String]](source.mkString) match {
        case Right(content) => content
        case Left(error) => throw new Exception(s"Error parsing manual translations json: $error. \nInput: $contentPath")
      } finally source.close()
    } match {
      case Success(content) => content
      case Failure(ex) =>
        log.warn(s"No manual sql translations loaded from $contentPath: ${ex.getMessage}")
        Map.empty
    }
  }

  def xmlToJson(powermart: Powermart)(implicit sqlTranslationEngine: String): Option[SqlContent] = {
    val folder = powermart.repository.folder
    val mappingName = folder.mappings.headOption.map(_.name).getOrElse("")
    // Go through all transformations: global + mapping + mapplets
    val allTransformations =
      folder.transformation ++
        folder.mappings.flatMap(_.transformations) ++
        folder.mapplets.flatMap(_.transformations)
    val transformationContentList: List[TransformationContent] =
      allTransformations.collect {
        // Source Qualifier case: check sqlQuery
        case transformation if transformation.typ == SourceQualifier =>
          getTableAttributeValue(transformation, SqlQuery)
            .map(prepareExpressionString)
            .map { sql =>
              val (content, translationEngine) = getTranslatedSql(mappingName, transformation.name, sql)
              TransformationContent(
                transformation.name,
                translationEngine = translationEngine,
                sqlQuery = Some(sql),
                sqlQueryTranslated = Some(content)
              )
            }
        // Lookup case: check sqlOverride
        case transformation if transformation.typ == LookupProcedure =>
          getTableAttributeValue(transformation, LookupSqlOverride)
            .map(prepareExpressionString)
            .map { sql =>
              val (content, translationEngine) = getTranslatedSql(mappingName, transformation.name, sql)
              TransformationContent(
                transformation.name,
                translationEngine = translationEngine,
                sqlOverride = Some(sql),
                sqlOverrideTranslated = Some(content)
              )
            }
      }.flatten.toList
    if (transformationContentList.isEmpty) None else Some(SqlContent(transformationContentList))
  }

  /**
   * Translates sql query to another dialect
   *
   * @param mappingName - mapping name
   * @param transformationName - transformation name
   * @param originSql - original sql query
   * @param sqlTranslationEngine - translation engine name
   * @return - translated sql query
   */
  def getTranslatedSql(mappingName: String, transformationName: String, originSql: String)
                      (implicit sqlTranslationEngine: String): (String, String) = {
    // Step 1: Check if there is a manual translation
    val keyContent = s"$mappingName.$transformationName"
    manualSqlContent
      .get(keyContent)
      .map(content => (content, "manual"))
      .getOrElse(
        (// Step 2: Else apply automation translation
          SqlTranslatorFactory
            .getSqlTranslator(sqlTranslationEngine)
            .map(_.convertOracleToBq(originSql))
            .map(prepareExpressionString)
            // Step 3: Else fallback - empty string
            .getOrElse(""),
          sqlTranslationEngine)
      )
  }

}
