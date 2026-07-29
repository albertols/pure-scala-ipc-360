package io.pure360.ipc.xmltojson.nodes

import io.pure360.ipc.xmltojson.nodes.Mapping._
import io.pure360.ipc.xmltojson.nodes.Mapplet._
import io.pure360.ipc.xmltojson.nodes.Source._
import io.pure360.ipc.xmltojson.nodes.Target._
import io.pure360.ipc.xmltojson.nodes.Transformation._

import scala.xml._

object Folder {

  def parseFolder(node: NodeSeq): Folder = {
    val name = (node \ "@NAME").text
    val group = (node \ "@GROUP").text
    val owner = (node \ "@OWNER").text
    val shared = (node \ "@SHARED").text
    val description = (node \ "@DESCRIPTION").text
    val permissions = (node \ "@PERMISSIONS").text
    val uuid = (node \ "@UUID").text

    val sourceNodes = node \ "SOURCE"
    val sourceNodesSeq = sourceNodes.seq.map(Source.parseSource)

    val targetNodes: NodeSeq = node \ "TARGET"
    val targetNodesSeq = targetNodes.seq.map(Target.parseTarget)

    val transformationNodes: NodeSeq = node \ "TRANSFORMATION"
    val transformationNodesSeq = transformationNodes.seq.map(Transformation.parseTransformation)

    val mapplets: NodeSeq = node \ "MAPPLET"
    val mappletNodesSeq = mapplets.seq.map(parseMapplet)

    val mappings: NodeSeq = node \ "MAPPING"
    val mappingNodesSeq = mappings.seq.map(Mapping.parseMapping)

    Folder(name, group, owner, shared, description, permissions, uuid, sourceNodesSeq, targetNodesSeq, transformationNodesSeq, mappletNodesSeq, mappingNodesSeq)
  }

  case class Folder(
                     name: String,
                     group: String,
                     owner: String,
                     shared: String,
                     description: String,
                     permissions: String,
                     uuid: String,
                     sources: Seq[Source],
                     targets: Seq[Target],
                     transformation: Seq[Transformation],
                     mapplets: Seq[Mapplet],
                     mappings: Seq[Mapping]
                   )

}
