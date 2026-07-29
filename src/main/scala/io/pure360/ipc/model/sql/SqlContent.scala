package io.pure360.ipc.model.sql

case class SqlContent (items: List[TransformationContent])

case class TransformationContent (name: String,
                                  translationEngine: String = "default",
                                  translatedBigQueryCompliant: Boolean = false,
                                  sqlQuery: Option[String] = None,
                                  sqlQueryTranslated: Option[String] = None,
                                  userDefinedJoin: Option[String] = None,
                                  userDefinedJoinTranslated: Option[String] = None,
                                  sqlOverride: Option[String] = None,
                                  sqlOverrideTranslated: Option[String] = None)
