package io.pure360.ipc.model.enums

import io.pure360.ipc.utils.enumeration.EnumUtils.matchEnum

object LookupMatchType extends Enumeration {

  val Any, First, Last = Value

  def apply(lookupMatchType: String): LookupMatchType.Value = {
    matchEnum(lookupMatchType, LookupMatchType) match {
      case None =>
        val parts = lookupMatchType.split(" ")
        if (parts.size > 1)
          apply(parts(1))
        else
          throw new Exception(s"LookupMatch type $lookupMatchType not known")
      case Some(lookupMatchTypeValue) => lookupMatchTypeValue
    }
  }

}

