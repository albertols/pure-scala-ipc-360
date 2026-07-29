package io.pure360.ipc.xmltojson.nodes

import scala.xml._

object Target {

  def parseTargets(xmlString: String): Seq[Target] = {
    val xml = XML.loadString(xmlString)
    val targetNodes = xml \\ "TARGET"
    targetNodes.map(parseTarget)
  }

  def parseTarget(targetNode: Node): Target = {
    val businessName = targetNode \@ "BUSINESSNAME"
    val constraint = targetNode \@ "CONSTRAINT"
    val databaseType = targetNode \@ "DATABASETYPE"
    val description = targetNode \@ "DESCRIPTION"
    val name = targetNode \@ "NAME"
    val objectVersion = targetNode \@ "OBJECTVERSION"
    val tableOptions = targetNode \@ "TABLEOPTIONS"
    val versionNumber = targetNode \@ "VERSIONNUMBER"
    val targetFields = (targetNode \ "TARGETFIELD").map(parseTargetField)
    Target(
      businessName,
      constraint,
      databaseType,
      description,
      name,
      objectVersion,
      tableOptions,
      versionNumber,
      targetFields
    )
  }

  def parseTargetField(fieldNode: Node): TargetField = {
    TargetField(
      businessName = fieldNode \@ "BUSINESSNAME",
      dataType = fieldNode \@ "DATATYPE",
      description = fieldNode \@ "DESCRIPTION",
      fieldNumber = (fieldNode \@ "FIELDNUMBER").toInt,
      keyType = fieldNode \@ "KEYTYPE",
      name = fieldNode \@ "NAME",
      nullable = fieldNode \@ "NULLABLE",
      pictureText = fieldNode \@ "PICTURETEXT",
      precision = fieldNode \@ "PRECISION",
      scale = fieldNode \@ "SCALE"
    )
  }

  case class TargetField(
                          businessName: String,
                          dataType: String,
                          description: String,
                          fieldNumber: Int,
                          keyType: String,
                          name: String,
                          override val nullable: String,
                          pictureText: String,
                          precision: String,
                          scale: String
                        ) extends AbstractField

  case class Target(
                     businessName: String,
                     constraint: String,
                     databaseType: String,
                     description: String,
                     name: String,
                     objectVersion: String,
                     tableOptions: String,
                     versionNumber: String,
                     targetFields: Seq[TargetField]
                   )

}
