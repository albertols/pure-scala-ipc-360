package io.pure360.ipc.xmltojson

import io.pure360.ipc.scalamatica.spark.utils.enums.SingleLayerEnum

import scala.util.matching.Regex

/**
 * Utility object to keep constants, regex for
 * - [[XMLParser]]
 * - [[XMLReplacementExecutor]]
 * - [[io.pure360.ipc.xmltojson.inventory.XmlParserInventoryGenerator]]
 * - [[io.pure360.ipc.xmltojson.control.LayerToLayerConfigGenerator]]
 */
object XmlParserConstants {

  // REGEX
  val datasetIdWithNARString: String = "^([A-Za-z_]+)_(\\d+)_(\\d+)$"
  val datasetIdWithNARRegex: Regex = datasetIdWithNARString.r
  val errorAndControlErrorPattern: Regex = ".*(ERR_|CONTROL_ERROR).*".r
  val mappingNameRegex: Regex = "m_([A-Z_0-9]+)".r  //TODO: Review mapping regex for edge cases

  val stgTablePattern: Regex = """^STG(_.+)$""".r
  val legacyFlowPatternMap: Map[SingleLayerEnum.Value, List[Regex]] = Map(SingleLayerEnum.ODS -> List("^(s_)?m_STG_.*".r))
  val odsTablePattern: Regex = """^ODS(_.+)$""".r
  val etlTablePattern: Regex = """^DWH_E(_.+)$""".r

  // Constants
  val DEV_PROJECT_ID = "pure360-dev-project"
  val DWH_CONTROL_DATASET = "DWH_CONTROL"
  val LAYER_TO_LAYER_CONFIG_TABLE = "SCALAMATICA_LAYER_TO_LAYER_CONFIG"
  val UNRESOLVED_SOURCE_DATASET = "UNRESOLVED_SOURCE_DATASET"

}
