package io.pure360.ipc.model.enums

import io.pure360.ipc.utils.enumeration.EnumUtils.matchEnum

object ScalaType extends Enumeration {

  val String, BigDecimal, Long, Integer, Timestamp, LocalDateTime, LocalDate, Boolean, Unknown = Value

  def apply(scalaType: String): ScalaType.Value = {
    matchEnum(scalaType.toUpperCase(), ScalaType) match {
      case None => throw new Exception(s"Scala type $scalaType not known")
      case Some(scalaTypeValue) => scalaTypeValue
    }
  }
}

