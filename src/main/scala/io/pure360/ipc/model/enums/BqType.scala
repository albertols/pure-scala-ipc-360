package io.pure360.ipc.model.enums

import io.pure360.ipc.utils.enumeration.EnumUtils.matchEnum

object BqType extends Enumeration {

  val BOOLEAN, STRING, INT64, INT, SMALLINT, INTEGER, BIGINT, TINYINT, BYTEINT,
  NUMERIC, DECIMAL, BIGNUMERIC, BIGDECIMAL, FLOAT64, DATE, DATETIME, TIMESTAMP, UNKNOWN = Value

  def apply(bqType: String): BqType.Value = {
    matchEnum(bqType.toUpperCase(), BqType) match {
      case None => throw new Exception(s"BigQuery type $bqType not known")
      case Some(bqTypeValue) => bqTypeValue
    }
  }

}
