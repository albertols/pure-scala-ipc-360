package io.pure360.ipc.scalamatica.spark.utils.enums

import io.pure360.ipc.utils.enumeration.EnumUtils.matchEnum

/**
 * Enumeration for the possible single layers that Scalamatica can process.
 */
object SingleLayerEnum extends Enumeration {

  val HOST, RAW, STG, ODS, ETL, DWH, RDM, QDM, CDM, OUTPUT = Value

  def apply(singleLayer: String): SingleLayerEnum.Value = {
    matchEnum(singleLayer.toUpperCase(), SingleLayerEnum) match {
      case None             => throw new Exception(s"SingleLayerEnum $singleLayer not known")
      case Some(layerValue) => layerValue
    }
  }
}
