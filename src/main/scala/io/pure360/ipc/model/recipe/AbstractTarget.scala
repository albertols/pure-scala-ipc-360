package io.pure360.ipc.model.recipe

/**
 * This abstract trait is the basis for families of [[Step]] targets
 */
sealed trait AbstractTarget extends AbstractItem {
  def fields: List[Field]
}

case class TableTarget (name: String,
                        `type`: String = "table",
                        primaryKeys: Option[List[String]] = None,
                        updateOverride: Option[String] = None,
                        fields: List[Field]) extends AbstractTarget

case class UnionInputTarget (name: String,
                             `type`: String = "unionInput",
                             fields: List[Field]) extends AbstractTarget

case class SourceQualifierTarget (name: String,
                                  `type`: String = "sourceQualifier",
                                  sourceFilter: Option[String] = None,
                                  sqlQuery: Option[String] = None,
                                  userDefinedJoin: Option[String] = None,
                                  selectDistinct: Boolean = false,
                                  fields: List[Field]) extends AbstractTarget

case class FilterTarget (name: String,
                         `type`: String = "filter",
                         filterCondition: Option[RecipeTransformation] = None,
                         fields: List[Field]) extends AbstractTarget

case class JoinerTarget (name: String,
                         `type`: String = "joinerInput",
                         fields: List[Field]) extends AbstractTarget

case class AggregatorTarget (name: String,
                             `type`: String = "aggregator",
                             groupByFields: List[String],
                             fields: List[Field]) extends AbstractTarget

case class RouterTarget (name: String,
                        `type`: String = "router",
                         groups: List[RouterGroup],
                         fields: List[Field]) extends AbstractTarget

case class RouterGroup (name: String, filterCondition: Option[String] = None, default: Boolean = false, fields: List[Field])

/**
 * Target case class for Normalizer Transformation from Informatica
 * https://docs.informatica.com/integration-cloud/data-integration/current-version/transformations/normalizer-transformation.html
 *
 * @param name - transformation name
 * @param `type` - transformation type
 * @param normalizedFields - list of output normalized fields
 * @param fields - list of calculated input fields
 */
case class NormalizerTarget (name: String,
                             `type`: String = "normalizer",
                             normalizedFields: List[NormalizedField],
                             fields: List[Field]) extends AbstractTarget

/**
 * Case class for normalized fields within [[NormalizerTarget]]
 * https://docs.informatica.com/integration-cloud/data-integration/current-version/transformations/normalizer-transformation/normalized-fields/generated-keys.html
 *
 * @param name - field name
 * @param refSource - list of input fields to be normalized
 * @param generatedColumnId - flag indicates a generation of GCID_FieldName. A column ID value that represents the instance of the multiple-occurring data.
 *                          For example, if an Expenses field that includes four occurs, the task uses values 1 through 4 to represent each type of occurring data.
 * @param generatedKey - flag indicates a generation of GK_FieldName. A key value that the task generates each time it processes an incoming row.
 *                     When a task runs, it starts the generated key with one and increments by one for each processed row.
 *                     The Normalizer transformation uses one generated key field for all data to be normalized.
 */
case class NormalizedField (name: String,
                            refSource: List[String],
                            generatedColumnId: Boolean = false,
                            generatedKey: Boolean = false)

case class JavaTarget (name: String,
                       `type`: String = "java",
                       javaCode: String,
                       fields: List[Field]) extends AbstractTarget

case class StoredProcedureTarget (name: String,
                                 `type`: String = "storedProcedure",
                                  procedureName: String,
                                  returnField: Option[String],
                                  fields: List[Field]) extends AbstractTarget