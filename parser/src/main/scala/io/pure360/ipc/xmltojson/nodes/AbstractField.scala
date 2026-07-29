package io.pure360.ipc.xmltojson.nodes

/**
 * This interface encapsulates common parts for TargetField, SourceField and TransformedField
 */
trait AbstractField {

  def name: String

  def dataType: String

  def portType: String = ""

  def precision: String

  def scale: String

  def nullable: String = ""

  def description: String

  def fieldType: String = ""

  def nestedFields: Seq[AbstractField] = Seq.empty

}
