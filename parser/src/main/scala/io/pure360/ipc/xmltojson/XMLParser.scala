package io.pure360.ipc.xmltojson

import io.pure360.ipc.json.JsonCodecs._
import io.pure360.ipc.utils.dir.ScalaFileUtils
import io.pure360.ipc.utils.dir.ScalaFileUtils.{getAbsoluteFileFromRelative, getAllFilesWithExtension, getFileNameWithoutExtension}
import io.pure360.ipc.xmltojson.XmlParserConstants._
import io.pure360.ipc.xmltojson.nodes.XMLRoot._
import io.pure360.ipc.xmltojson.recipe.RecipeGenerator
import io.pure360.ipc.xmltojson.sql.SqlTranslatorGenerator
import io.pure360.ipc.xmltojson.utils.XMLDataUtils._
import io.circe._
import io.circe.syntax._
import org.rogach.scallop._
import org.slf4j.{Logger, LoggerFactory}

import java.io.{File, FileInputStream, PrintWriter}
import javax.xml.parsers.SAXParser
import scala.annotation.tailrec
import scala.util.matching.compat.RegexOps
import scala.util.{Failure, Success, Try}
import scala.xml._

object XMLParser {

  val log: Logger = LoggerFactory getLogger getClass.getName

  class CmdLineArgs(args: Seq[String]) extends ScallopConf(args) {
    val xmlPath: ScallopOption[String] = opt[String]("xmlPath", required = true, descr = "File or Dirs (and .XMLs in subdirs) for XMLs")
    val generateDDLContent: ScallopOption[Boolean] =
      opt[Boolean]("generateDDLContent", required = false, descr = "generateDDLContent", default = Some(false))
    val generateTargetDDL: ScallopOption[Boolean] =
      opt[Boolean]("generateTargetDDL", required = false, descr = "outputs BQ ddl for Target tables", default = Some(false))
    val generateSourceDDL: ScallopOption[Boolean] =
      opt[Boolean]("generateSourceDDL", required = false, descr = "outputs BQ ddl for Source tables", default = Some(false))
    val generateRecipe: ScallopOption[Boolean] =
      opt[Boolean]("generateRecipe", required = false, descr = "outputs _ETL_*.json transformations recipe", default = Some(false))

    verify()
  }

  lazy val projectVersion: String = {
    val versionNode = (XML.loadFile("pom.xml") \ "version").headOption
    versionNode.map(_.text.trim).getOrElse("unknown-version")
  }

  def isDatasetIdWithNARValid(input: String): Boolean = datasetIdWithNARRegex.pattern.matcher(input).matches

  def main(args: Array[String]): Unit = {
    val conf = new CmdLineArgs(args)
    log.info(s"$conf")
    log.info(s"projectVersion=$projectVersion")

    val allDdl: List[Seq[File]] = allDDLFiles(conf)
    log.info(s"allDdl.size=${allDdl.size}")
  }

  /**
   * For each XML applies createBQJsonSchemaFromXml
   *
   * @param conf - cmd args
   * @return DDL.json Files per XML
   */
  def allDDLFiles(conf: CmdLineArgs): List[Seq[File]] = {
    val file = getAbsoluteFileFromRelative(conf.xmlPath())
    val xmlFiles: List[File] = if (file.isFile) List(file) else getAllFilesWithExtension(conf.xmlPath(), ".xml")
    xmlFiles.map(xmlFile => createBQJsonSchemaFromXml(xmlFile, conf))
  }

  /**
   * @param file
   *   , XML File to be parsed
   * @param conf
   *   , considers flags:
   * --generateDDLContent
   * --generateTargetDDL
   * --generateSourceDDL
   * --generateRecipe
   * @return
   *   Seq[File] with all the DDL.json
   */
  def createBQJsonSchemaFromXml(file: File, conf: CmdLineArgs): Seq[File] = {
    val parsedXmlPowermart: Powermart = getParsedXml(file)
    val (preparedPowermart, _, _) = XMLReplacementExecutor.preparePowermart(parsedXmlPowermart, file, List.empty, Map.empty)

    // Output directory for JSON DDL files
    val fileNameWithoutExtension = getFileNameWithoutExtension(file)
    val outputDirectory = s"${file.getParentFile}/$fileNameWithoutExtension"
    ScalaFileUtils.createDir(outputDirectory)

    // SOURCE: Output DDL.json
    val sourceDDLOutputFiles: Seq[File] =
      if (conf.generateSourceDDL().booleanValue()) {
        val sources = preparedPowermart.repository.folder.sources
        sources.map { source =>
          val sourceFileName = s"${source.name.toUpperCase}.json"
          log.info(s"[Source] Generating JSON DDL file $sourceFileName")
          val bqJsonDdl = generateBigQueryJsonDdl(source.sourceFields)
          val sourceOutputFile = new File(outputDirectory, sourceFileName)

          // Write the JSON DDL to the output file
          if (conf.generateDDLContent().booleanValue()) {
            val writer = new PrintWriter(sourceOutputFile)
            try {
              writer.write(bqJsonDdl)
            } catch {
              case e: Exception => log.error(s"[Source] NOT Created JSON DDL file: ${sourceOutputFile.getAbsolutePath}", e)
            } finally {
              writer.close()
            }
            log.info(s"[Source] Created JSON DDL file: ${sourceOutputFile.getAbsolutePath}")
          }
          sourceOutputFile
        }
      } else Seq()

    // TARGETS: Output DDL.json
    val targetDDLOutputFiles: Seq[File] = if (conf.generateTargetDDL().booleanValue()) {
      val targets = preparedPowermart.repository.folder.targets.filterNot(target => errorAndControlErrorPattern.matches(target.name))
      targets.map { target =>
        val fileName = s"${target.name.toUpperCase}.json"
        log.info(s"[Target] Generating JSON DDL file $fileName")
        val bqJsonDdl = generateBigQueryJsonDdl(target.targetFields)
        val outputFile = new File(outputDirectory, fileName)

        // Write the JSON DDL to the output file
        if (conf.generateDDLContent().booleanValue()) {
          val writer = new PrintWriter(outputFile)
          try {
            writer.write(bqJsonDdl)
          } catch {
            case e: Exception => log.error(s"[Target] NOT Created JSON DDL file: ${outputFile.getAbsolutePath}", e)
          } finally {
            writer.close()
          }
          log.info(s"[Target] Created JSON DDL file: ${outputFile.getAbsolutePath}")
        }
        outputFile
      }
    } else Seq()

    // RECIPE
    val recipePath = s"$outputDirectory/_ETL_$fileNameWithoutExtension.json"
    val sqlTranslationEngine = "default"
    val sqlTranslationPath = s"$outputDirectory/_sqlTranslations_ETL_$fileNameWithoutExtension.json"
    if (conf.generateRecipe().booleanValue()) {
      log.info(s"[TreeRecipe] Generating TreeRecipe for $fileNameWithoutExtension")
      xmlToJsonRecipe(recipePath, preparedPowermart, fileNameWithoutExtension)
      xmlToJsonSqlTranslation(sqlTranslationPath, preparedPowermart, sqlTranslationEngine)
    } else log.warn(s"generateRecipe=${conf.generateRecipe().booleanValue()} for recipePath=$recipePath")

    targetDDLOutputFiles ++ sourceDDLOutputFiles
  }

  def getRelativeRepoPath(fullPath: String, repoName: String): String = {
    val path = java.nio.file.Paths.get(fullPath)
    import scala.collection.JavaConverters._
    val repoIndex = path.iterator().asScala.indexWhere(_.toString == repoName)

    if (repoIndex != -1) {
      // Reconstruct the relative path from repoName onwards
      path.subpath(repoIndex + 1, path.getNameCount).toString
    } else {
      // If repoName is not found, return the original path
      fullPath
    }
  }

  /**
   * Load the XML file from absoultePath and parse powermart
   *
   * @param file - input xml file
   * @return [[Powermart]] IPC XML structure
   */
  def getParsedXml(file: File): Powermart = {
    val xml = XML.withSAXParser(customXmlParser).load(new FileInputStream(file.getAbsolutePath))
    parsePowermart(xml)
  }

  /**
   * This method performs the following steps converting xml mapping to json recipe:
   *  - generate basic [[io.pure360.ipc.model.recipe.Recipe]] object
   *  - write the recipe object to json file
   *
   * @param etlJsonRecipePath - recipe destination path
   * @param powermart - initial [[Powermart]] object
   * @param mapping - mapping name
   */
  private def xmlToJsonRecipe(etlJsonRecipePath: String, powermart: Powermart, mapping: String): Unit = {
    Try(RecipeGenerator.xmlToTreeEtlRecipe(powermart)) match {
      case Success(recipe) =>
        log.info(s"Successful recipe for $etlJsonRecipePath")
        val prettyJsonString = recipe.asJson.deepDropNullValues
        val asciiJsonString = latinToAscii(prettyJsonString.toString)
        writeToJson(io.circe.parser.parse(asciiJsonString).getOrElse(Json.Null), etlJsonRecipePath)
      case Failure(e) => log.error(s"Orphan recipe from $mapping", e)
    }
  }

  private def xmlToJsonSqlTranslation(jsonPath: String, powermart: Powermart, sqlTranslationEngine: String): Unit = {
    Try(SqlTranslatorGenerator.xmlToJson(powermart)(sqlTranslationEngine)) match {
      case Success(sqlContent) =>
        log.info(s"Successful sqlTranslation for $jsonPath")
        sqlContent.foreach(sql => writeToJson(sql.asJson.deepDropNullValues, jsonPath))
      case Failure(e) => log.error(s"Failure in generation $jsonPath", e)
    }
  }

  def writeToJson(json: Json, filePath: String): Unit = {
    val writer = new PrintWriter(new File(filePath))
    // You can use `spaces2` for pretty formatting
    Try(writer.write(json.spaces2)) match {
      case Success(_) => log.info(s"new .json under $filePath")
      case Failure(e) => log.error(s"failure writing .json due to ", e)
    }
    writer.close()
  }

  @tailrec
  def getDatasetIdFromRecursiveParentDir(xmlFile: File, defaultValue: String): String = {
    val datasetIdFromFile = xmlFile.getName
    if (xmlFile.isDirectory && isDatasetIdWithNARValid(datasetIdFromFile)) datasetIdFromFile
    else if (null != xmlFile.getParentFile && xmlFile.getParentFile.isDirectory) {
      getDatasetIdFromRecursiveParentDir(xmlFile.getParentFile, defaultValue) // recursion from parent
    } else defaultValue
  }

  private def customXmlParser: SAXParser = {
    val f = javax.xml.parsers.SAXParserFactory.newInstance()
    f.setNamespaceAware(false)
    f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", false)
    f.setFeature("http://apache.org/xml/features/nonvalidating/load-dtd-grammar", false)
    f.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false)
    f.newSAXParser()
  }
}
