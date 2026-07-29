package io.pure360.ipc.xmltojson.nodes

import io.pure360.ipc.xmltojson.nodes.Folder._

import scala.xml._

object XMLRoot {

  def parsePowermart(xml: Elem): Powermart = {
    val creationDate = (xml \ "@CREATION_DATE").text
    val repositoryVersion = (xml \ "@REPOSITORY_VERSION").text
    val repositoryNode = xml \ "REPOSITORY"
    val repository = parseRepository(repositoryNode)
    Powermart(creationDate, repositoryVersion, repository)
  }

  def parseRepository(node: NodeSeq): Repository = {
    val name = (node \ "@NAME").text
    val version = (node \ "@VERSION").text
    val codepage = (node \ "@CODEPAGE").text
    val databaseType = (node \ "@DATABASETYPE").text
    val folderNode = node \ "FOLDER"
    val folder = Folder.parseFolder(folderNode)
    Repository(name, version, codepage, databaseType, folder)
  }

  case class Powermart(creationDate: String, repositoryVersion: String, repository: Repository)

  case class Repository(name: String, version: String, codepage: String, databaseType: String, folder: Folder)

}
