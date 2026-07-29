package io.pure360.ipc.xmltojson.utils

import io.pure360.ipc.model.enums.{BqType, ScalaType}
import io.pure360.ipc.model.recipe.InstanceCursor
import io.pure360.ipc.scalamatica.spark.utils.enums.SingleLayerEnum
import io.pure360.ipc.xmltojson.XmlParserConstants.errorAndControlErrorPattern
import io.pure360.ipc.xmltojson.nodes.Folder.Folder
import io.pure360.ipc.xmltojson.nodes.Mapplet.{Instance, Mapplet}
import io.pure360.ipc.xmltojson.nodes.Transformation.Transformation
import io.pure360.ipc.xmltojson.nodes.XMLRoot.Powermart
import io.pure360.ipc.xmltojson.nodes.{AbstractField, Mappable}
import io.pure360.ipc.xmltojson.recipe.RecipeConstants.GlobalTransformationExclusionList
import io.pure360.ipc.xmltojson.recipe.StepMode
import io.circe.syntax._
import org.slf4j.{Logger, LoggerFactory}

import java.io.File
import java.text.Normalizer
import scala.annotation.tailrec
import scala.util.matching.compat.RegexOps
import scala.util.{Failure, Success, Try}

/**
 * This is an auxiliary utility class for XMLParser related static methods.
 * It contains methods to get/filter/map metadata from different XML nodes
 */
object XMLDataUtils {

  val log: Logger = LoggerFactory getLogger getClass.getName

  /** Returns the recipe name without leading underscores or the .json extension. */
  def cleanRecipeName(recipeFileName: String): String = recipeFileName.replaceAll("^_", "").replaceAll("\\.json$", "")

  def getTargetNames(powermart: Powermart,
                     datasetId: Option[String] = None): List[String] =
    powermart.repository.folder.targets
      .map(_.name.toUpperCase)
      .filterNot(errorAndControlErrorPattern.matches(_))
      .map(name => datasetId.map(d => s"$d.$name").getOrElse(name))
      .toList

  def getSourceNames(powermart: Powermart,
                     datasetId: Option[String] = None): Seq[String] =
    powermart.repository.folder.sources
      .map(_.name.toUpperCase)
      .map(name => datasetId.map(d => s"$d.$name").getOrElse(name))


  /**
   * This method converts Oracle data types to BigQuery equivalent types according to Google translation guide
   * https://cloud.google.com/bigquery/docs/migration/oracle-sql#data_types
   *
   * @param field - field containing data type, precision and scale
   * @return - BQ data  type string
   */
  def mapOracleTypeToBqType(field: AbstractField): BqType.Value = field.dataType.toLowerCase match {
    case "varchar2" | "varchar" | "nvarchar2" | "string" | "char" | "clob" | "nchar" => BqType.STRING
    case "number" => BqType.NUMERIC
    case "integer" => BqType.INT64
    case "number(p,s)" =>
      if (field.scale == "0" && field.precision.toInt < 19) BqType.INT64 else BqType.NUMERIC
    case "number(p)" =>
      if (field.precision.toInt < 19) BqType.INT64 else BqType.NUMERIC
    case "datetime" | "date" => BqType.DATETIME
    case "timestamp" => BqType.TIMESTAMP
    case _ =>
      log.error(s"Unknown FieldType $field.dataType")
      BqType.UNKNOWN // Default to UNKNOWN if not recognized
  }

  /**
   * This method converts Oracle data types to Scala equivalent types taking into account the further writing to BQ
   *
   * @param field - field containing data type, precision and scale
   * @return - Scala type
   */
  def mapOracleTypeToScalaType(field: AbstractField): ScalaType.Value = field.dataType.toLowerCase match {
    case "varchar2" | "varchar" | "nvarchar2" | "string" | "char" | "clob" | "nchar" => ScalaType.String
    case "number" => ScalaType.BigDecimal
    case "integer" => ScalaType.Long
    case "number(p,s)" =>
      if (field.scale == "0" && field.precision.toInt < 19) ScalaType.Long else ScalaType.BigDecimal
    case "number(p)" =>
      if (field.precision.toInt < 19) ScalaType.Long else ScalaType.BigDecimal
    case "datetime" | "date" => ScalaType.LocalDateTime
    case "timestamp" => ScalaType.Timestamp
    case _ =>
      log.error(s"Unknown FieldType $field.dataType")
      ScalaType.Unknown // Default to Unknown if not recognized
  }

  /**
   * This method converts Informatica data types to Scala equivalent types
   *
   * @param field - field containing data type, precision and scale
   * @return - Scala type
   */
  def mapInformaticaTypetoScalaType(field: AbstractField): ScalaType.Value = field.dataType.toLowerCase match {
    case "string" | "nstring" | "text" => ScalaType.String
    case "double" => ScalaType.BigDecimal
    case "decimal" => ScalaType.BigDecimal
    case "date/time" => ScalaType.Timestamp
    case "bigint" => ScalaType.Long
    case "integer" => ScalaType.Integer
    case _ =>
      log.error(s"Unknown FieldType $field.dataType")
      ScalaType.Unknown // Default to Unknown if not recognized
  }

  def mapTransformationTypeToScalaType(stepMode: StepMode.Value, field: AbstractField): ScalaType.Value = stepMode match {
    case StepMode.TARGET => mapOracleTypeToScalaType(field)
    case _ => mapInformaticaTypetoScalaType(field)
  }

  def getWithGlobalTransformation(cursor: InstanceCursor): Transformation =
    getWithGlobalTransformation(cursor.folder, cursor.mappable, cursor.instance.transformationName)

  def getWithGlobalTransformation(folder: Folder, mappable: Mappable, transformationName: String): Transformation =
    mappable.transformations.find(_.name == transformationName)
      .getOrElse(folder.transformation.find(_.name == transformationName).get)

  def isGlobalTransformation(cursor: InstanceCursor, transformation: Transformation): Boolean =
    cursor.folder.transformation.contains(transformation) &&
      !GlobalTransformationExclusionList.contains(transformation.name)

  def getMappletMainTransformation(mappable: Mappable): Transformation =
    mappable.transformations.find(_.name == mappable.name).get

  def getTableAttributeValue(cursor: InstanceCursor, key: String): Option[String] =
    getTableAttributeValue(getWithGlobalTransformation(cursor), key)

  def getTableAttributeValue(transformation: Transformation, key: String): Option[String] =
    transformation.tableAttributeFields.find(_.name == key).map(_.value).filter(_.nonEmpty)

  def getTableAttributeValue(instance: Instance, key: String): Option[String] =
    instance.tableAttributeFields.find(_.name == key).map(_.value).filter(_.nonEmpty)

  def getMetadataExtensionValue(cursor: InstanceCursor, key: String): Option[String] =
    getMetadataExtensionValue(getWithGlobalTransformation(cursor), key)

  def getMetadataExtensionValue(transformation: Transformation, key: String): Option[String] =
    transformation.metadataExtensions.find(_.name == key).map(_.value).filter(_.nonEmpty)

  /**
   * Checks if the current [[Powermart]] has a STG source
   *
   * @param powermart - the current powermart
   * @return boolean whether there is a STG source
   */
  def isStgInSource(powermart: Powermart): Boolean =
    powermart.repository.folder.sources.map(_.name).exists(_.startsWith("STG_"))

  /**
   * Checks if the current [[Powermart]] has a PAR source
   *
   * @param powermart - the current powermart
   * @return boolean whether there is a PAR source
   */
  def isParInSource(powermart: Powermart): Boolean =
    powermart.repository.folder.sources.map(_.name).exists(name => name.endsWith("_PAR") && !name.startsWith("RDM_"))

  /**
   * This methods returns the transformation name and preceding mapplet name if the parent is mapplet
   *
   * @param cursor - the current cursor
   * @return - string name
   */
  def getNameWithMapplet(cursor: InstanceCursor): String =
    cursor.mappable match {
      case m: Mapplet => s"${m.name}_${cursor.instance.transformationName}"
      case _ => cursor.instance.transformationName
    }

  /**
   * Generates JSON DDL content for sources or targets
   *
   * @param fields - source or target fields
   * @return - ddl content string
   */
  def generateBigQueryJsonDdl(fields: Seq[AbstractField]): String = {

    def generateDdlFields(nestedFields: Seq[AbstractField]): Seq[String] =
      nestedFields.map { field =>
        field.fieldType match {
          case "GRPITEM" => generateDdlFields(field.nestedFields).mkString(",\n  ")
          case _ => generateDdlField(field)
        }
      }

    val bqSchema = generateDdlFields(fields).mkString("[\n  ", ",\n  ", "\n]")
    s"""$bqSchema"""
  }

  private def generateDdlField(field: AbstractField): String = {
    val mode = if (field.nullable.contains("NULL")) "NULLABLE" else "REQUIRED"
    s"""{
       |  "mode": "$mode",
       |  "name": "${latinToAscii(field.name)}",
       |  "type": "${mapOracleTypeToBqType(field)}",
       |  "description": ${field.description.asJson.toString}
       |  }""".stripMargin
  }

  @tailrec
  def getFolderLayer(xmlFile: File): SingleLayerEnum.Value =
    xmlFile match {
      case null => SingleLayerEnum.RAW
      case folder if folder.isDirectory =>
        Try{
          SingleLayerEnum(folder.getName)
        } match {
          case Success(layer) => layer
          case Failure(_) =>
            XMLDataUtils.getFolderLayer(folder.getParentFile)
        }
      case file => XMLDataUtils.getFolderLayer(file.getParentFile)
    }

  /**
   * Converts a string with possible Latin characters to its ASCII representation by removing diacritical marks.
   *
   * @param input the input string to normalize
   * @return the ASCII-normalized string
   */
  def latinToAscii(input: String): String = {
    val normalized = Normalizer.normalize(input, Normalizer.Form.NFD)
    normalized.replaceAll("\\p{InCombiningDiacriticalMarks}+", "")
  }
}
