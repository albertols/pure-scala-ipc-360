package io.pure360.ipc.model.recipe

/**
 * This abstract trait is the basis for families of [[Step]] sources
 */
sealed trait AbstractSource extends AbstractItem

case class UnionSource (name: String,
                        `type`: String = "union",
                        unionTables: List[UnionTable]) extends AbstractSource

case class UnionTable (name: String, fieldMapping: List[FieldMap])

case class FieldMap (origin: String, union: String)

case class SourceQualifierSource (name: String,
                                  `type`: String = "sourceQualifier") extends AbstractSource

case class TableSource (name: String,
                        `type`: String = "table",
                        primaryKeys: Option[List[String]] = None) extends AbstractSource

case class FilterSource (name: String,
                         `type`: String = "filter") extends AbstractSource

case class JoinerSource (name: String,
                         `type`: String = "joiner",
                         joinerTables: List[String],
                         joinerType: String,
                         joinerCondition: String) extends AbstractSource

case class AggregatorSource (name: String,
                             `type`: String = "aggregator") extends AbstractSource

case class RouterSource (name: String,
                         `type`: String = "router",
                         group: String) extends AbstractSource

case class NormalizerSource (name: String,
                            `type`: String = "normalizer") extends AbstractSource

case class JavaSource (name: String,
                       `type`: String = "java") extends AbstractSource

case class StoredProcedureSource (name: String,
                                 `type`: String = "storedProcedure") extends AbstractSource

