package io.pure360.ipc.xmltojson.nodes

import io.pure360.ipc.xmltojson.nodes.Mapplet.{Connector, Instance}
import io.pure360.ipc.xmltojson.nodes.Transformation._

/**
 * This interface encapsulates common parts for Mapping and Mapplet
 */
trait Mappable {

  def name: String
  def instances: Seq[Instance]
  def transformations: Seq[Transformation]
  def connectors: Seq[Connector]
}
