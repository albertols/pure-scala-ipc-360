package io.pure360.ipc.xmltojson

import io.pure360.ipc.scalamatica.spark.utils.enums.SingleLayerEnum
import io.pure360.ipc.utils.dir.ScalaFileUtils.getFileNameWithoutExtension
import io.pure360.ipc.xmltojson.XmlParserConstants._
import io.pure360.ipc.xmltojson.nodes.XMLRoot.Powermart
import io.pure360.ipc.xmltojson.recipe.RecipeConstants.{I_Source, I_Target, SourceQualifier, SqlQuery}
import io.pure360.ipc.xmltojson.utils.XMLDataUtils._

import java.io.File
import scala.collection.mutable
import scala.util.matching.compat.RegexOps

/**
 * - Input
 *    - [[Powermart]] object from the parsed original IPC xml
 * - Output
 *    - [[Powermart]] with replaced [[io.pure360.ipc.xmltojson.nodes.Source]] objects, [[io.pure360.ipc.xmltojson.nodes.Target]] objects
 *      and [[io.pure360.ipc.xmltojson.nodes.Mapplet.Instance]] if required
 */
object XMLReplacementExecutor {

  /**
   * This method processes the legacy parsed xml and makes appropriate target/source replacements.
   *
   * @param powermart     - the current [[Powermart]]
   * @param xmlFile       - the current xml file
   * @param partitionedList - the list of mapping with the writeMode 3 [[io.pure360.ipc.scalamatica.spark.scalamaticaio.enums.WriteMode.DELTA_PARTITIONED]]
   *                      or 4  [[io.pure360.ipc.scalamatica.spark.scalamaticaio.enums.WriteMode.DELTA_SUB_PARTITIONED]]
   * @param tablePartitionMap - map of the partition info
   * @return - prepared [[Powermart]], replaced sources map, replaced targets map
   */
  def preparePowermart(powermart: Powermart,
                       xmlFile: File,
                       partitionedList: List[String],
                       tablePartitionMap: Map[String, Seq[String]]): (Powermart, Map[String, String], Map[String, String]) = {
    val powermartAndReplacements = getFolderLayer(xmlFile) match {
      case SingleLayerEnum.ODS =>
        if (isXmlFileLegacyFlow(xmlFile)) {
          replaceOds(powermart)
        } else (powermart, Map.empty[String, String], Map.empty[String, String])
      case layer if (layer == SingleLayerEnum.ETL || layer == SingleLayerEnum.DWH || layer == SingleLayerEnum.CDM || layer == SingleLayerEnum.RDM || layer == SingleLayerEnum.QDM) && isStgInSource(powermart) =>
        replaceEtlDwhDm(powermart)
      case layer if (layer == SingleLayerEnum.CDM || layer == SingleLayerEnum.RDM || layer == SingleLayerEnum.QDM) && isMappingPartitioned(xmlFile, partitionedList) =>
        replaceDmPar(powermart)
      case _ => (powermart, Map.empty[String, String], Map.empty[String, String])
    }
    (adjustPartitionDataTypes(powermartAndReplacements._1, getFileNameWithoutExtension(xmlFile), tablePartitionMap),
      powermartAndReplacements._2,
      powermartAndReplacements._3)
  }

  /**
   * This method replaces sources, instances for legacy flows from ETL, DWH, CDM, QDM, RDM
   *
   * @param powermart - initial [[Powermart]] object
   * @return - replaced [[Powermart]], replaced sources map, replaced targets map
   */
  private def replaceEtlDwhDm(powermart: Powermart): (Powermart, Map[String, String], Map[String, String]) = {
    val sourceReplacements = mutable.Map[String, String]()
    val replacedPowermart = powermart.copy(repository =
      powermart.repository.copy(folder =
        powermart.repository.folder.copy(
          // Replace source table to ODS table
          sources = powermart.repository.folder.sources.map { source =>
            source.name.toUpperCase match {
              case stgTablePattern(body) =>
                sourceReplacements += (source.name.toUpperCase -> s"ODS$body")
                source.copy(name = s"ODS$body")
              case _ => source
            }
          },
          // Replace source mapping instances according to connected targets and sources
          mappings = powermart.repository.folder.mappings.map {mapping =>
            mapping.copy(instances = mapping.instances.map {instance =>
              (instance.tType, instance.transformationName.toUpperCase) match {
                case (I_Source, stgTablePattern(body)) => instance.copy(transformationName = s"ODS$body")
                case _ => instance
              }
            })
          }
        )
      )
    )
    (replacedPowermart, sourceReplacements.toMap, Map.empty)
  }

  /**
   * This method replaces SourceQualifier for 1-1 mappings from CDM, QDM, RDM
   * and injects a query to get the freshest result
   *
   * @param powermart - initial [[Powermart]] object
   * @return - replaced [[Powermart]], replaced sources map, replaced targets map
   */
  private def replaceDmPar(powermart: Powermart): (Powermart, Map[String, String], Map[String, String]) = {
    val sourceAmount = powermart.repository.folder.sources.size
    val replacedPowermart = if (sourceAmount == 1) {
      // Handle only 1 source - 1 target mappings
      val sourceTableName = powermart.repository.folder.sources.head.name
      powermart.copy(repository =
        powermart.repository.copy(folder =
          powermart.repository.folder.copy(
            mappings = powermart.repository.folder.mappings.map {mapping =>
              mapping.copy(
                // Replace Source Qualifier with SQL Query to get rows with MAX(FCH_TIMESTAMP)
                transformations = mapping.transformations.map { transformation =>
                  transformation.typ match {
                    case SourceQualifier =>
                      transformation.copy(
                        tableAttributeFields = transformation.tableAttributeFields.map { tableAttribute =>
                          (tableAttribute.name, tableAttribute.value.trim) match {
                            case (SqlQuery, "") =>
                              tableAttribute.copy(value = s"SELECT * FROM $sourceTableName WHERE DATE(FCH_TIMESTAMP) = (SELECT MAX(DATE(FCH_TIMESTAMP)) FROM $sourceTableName)")
                            case _ => tableAttribute
                          }
                        }
                      )
                    case _ => transformation
                  }
                }
              )
            }
          )
        )
      )
    } else {
      powermart
    }
    (replacedPowermart, Map.empty, Map.empty)
  }

  /**
   * This method replaces sources, targets, instances for legacy flows from STG_TO_ODS
   *
   * @param powermart - initial [[Powermart]] object
   * @return - replaced [[Powermart]]
   */
  private def replaceOds(powermart: Powermart): (Powermart, Map[String, String], Map[String, String]) = {
    // Store the current STG Target name to replace a main Source name
    var stgTargetToSource: Option[String] = None
    val legacySourceNames: List[String] = powermart.repository.folder.sources.map(_.name.toUpperCase).toList
    val sourceReplacements = mutable.Map[String, String]()
    val targetReplacements = mutable.Map[String, String]()

    val replacedPowermart = powermart.copy(repository =
      powermart.repository.copy(folder =
        powermart.repository.folder.copy(
          // Replace target table to ODS table
          targets = powermart.repository.folder.targets.map { target =>
            target.name.toUpperCase match {
              case stgTablePattern(body) =>
                stgTargetToSource = Some(target.name.toUpperCase)
                targetReplacements += (target.name.toUpperCase -> s"ODS$body")
                target.copy(name = s"ODS$body")
              case _ => target
            }
          },
          // Replace source tables to STG tables
          sources = powermart.repository.folder.sources.map { source =>
            source.name.toUpperCase match {
              case stgSource if isStgSourceMostSimilar(stgSource, stgTargetToSource, legacySourceNames) =>
                sourceReplacements += (source.name.toUpperCase -> stgTargetToSource.get)
                source.copy(name = stgTargetToSource.get)
              case _ => source
            }
          },
          // Replace target and source mapping instances according to connected targets and sources
          mappings = powermart.repository.folder.mappings.map {mapping =>
            mapping.copy(instances = mapping.instances.map {instance =>
              (instance.tType, instance.transformationName.toUpperCase) match {
                case (I_Target, stgTablePattern(body)) => instance.copy(transformationName = s"ODS$body")
                case (I_Source, stgSource) if isStgSourceMostSimilar(stgSource, stgTargetToSource, legacySourceNames) =>
                  instance.copy(transformationName = stgTargetToSource.get)
                case _ => instance
              }
            })
          }
        )
      )
    )
    (replacedPowermart, sourceReplacements.toMap, targetReplacements.toMap)
  }

  /**
   * @param targetTable - STG target table name, example 'STG_HIER_CALIF_D'
   * @param sourceTables - legacy FF source table names, example 'TMA252_L_D_CALIF', 'FF_DATE'
   * @return - the most similar source name, example 'TMA252_L_D_CALIF'
   */
  def findMostSimilarSource(targetTable: String, sourceTables: List[String]): String = {
    // split target name by '_' ignoring the prefix 'STG'
    val targetParts = targetTable.split("_").tail

    // function to identify similar parts
    def commonParts(sourceName: String): Int = {
      val sourceParts = sourceName.split("_")
      targetParts.intersect(sourceParts).length
    }

    // find among source names with the highest rate of common parts
    sourceTables.map { sourceName =>
      sourceName -> commonParts(sourceName)
    }.maxBy(_._2)._1
  }

  /**
   * Checks if the current legacy source is the closest to the legacy STG target
   *
   * @param stgSource - legacy source, example 'TMA252_L_D_CALIF'
   * @param stgTarget - legacy STG target, example 'STG_HIER_CALIF_D'
   * @param sourceTables - list of all source names, example 'TMA252_L_D_CALIF', 'FF_DATE'
   * @return - the flag whether the current source is the most similar to STG target
   */
  def isStgSourceMostSimilar(stgSource: String, stgTarget: Option[String], sourceTables: List[String]): Boolean =
    stgTarget.map(findMostSimilarSource(_, sourceTables))
      .exists(stgSource.equals(_))

  /**
   * This method checks if the current xml file belongs to legacy flows
   *
   * @param xmlFile - xml file
   * @return - the flag whether the xml file belongs to legacy flows or not
   */
  def isXmlFileLegacyFlow(xmlFile: File): Boolean = {
    legacyFlowPatternMap.getOrElse(getFolderLayer(xmlFile), List.empty)
      .exists(_.matches(getFileNameWithoutExtension(xmlFile)))
  }

  /**
   * This method checks if the current xml file belongs to partitioned
   *
   * @param xmlFile - xml file
   * @param partitionedList - list of partitioned mappings
   * @return - the flag whether the xml file belongs to partitioned or not
   */
  private def isMappingPartitioned(xmlFile: File, partitionedList: List[String]): Boolean =
    partitionedList.contains(getFileNameWithoutExtension(xmlFile))


  /**
   * Adjusts field data types according to partition info.
   * Currently when the partition info contains a field with 'NUMBER' type for the current table,
   * we convert the appropriate field datatype to 'integer' in the xml
   *
   * @param powermart [[Powermart]]
   * @param mappingXmlDir mapping dir name
   * @param tablePartitionMap map of the partition info
   * @return
   */
  private def adjustPartitionDataTypes(powermart: Powermart, mappingXmlDir: String, tablePartitionMap: Map[String, Seq[String]]): Powermart =
    powermart.copy(repository =
      powermart.repository.copy(folder =
        powermart.repository.folder.copy(
          targets = powermart.repository.folder.targets.map { target =>
            tablePartitionMap.get(target.name) match {
              case Some(Seq(_, partKey, "NUMBER", _, _)) =>
                target.copy(
                  targetFields = target.targetFields.map { targetField =>
                    targetField.name match {
                      case `partKey` => targetField.copy(dataType = "integer")
                      case _ => targetField
                    }
                  }
                )
              case _ => target
            }
          },
          sources = powermart.repository.folder.sources.map { source =>
            tablePartitionMap.get(source.name) match {
              case Some(Seq(_, partKey, "NUMBER", _, _)) =>
                source.copy(
                  sourceFields = source.sourceFields.map { sourceField =>
                    sourceField.name match {
                      case `partKey` => sourceField.copy(dataType = "integer")
                      case _ => sourceField
                    }
                  }
                )
              case _ => source
            }
          }
        )
      )
    )
}
