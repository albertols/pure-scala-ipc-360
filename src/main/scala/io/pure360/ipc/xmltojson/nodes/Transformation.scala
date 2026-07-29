package io.pure360.ipc.xmltojson.nodes

import io.pure360.ipc.xmltojson.nodes.Source.{MetadataExtension, SourceField, parseMetadataExtension, parseSourceField}

import scala.xml._

object Transformation {

  def parseTransformation(node: Node): Transformation = {
    val description: String = node \@ "DESCRIPTION"
    val name: String = node \@ "NAME"
    val objectVersion: String = node \@ "OBJECTVERSION"
    val reusable: String = node \@ "REUSABLE"
    val typ: String = node \@ "TYPE"
    val templateName = node \@ "TEMPLATENAME"
    val versionNumber = node \@ "VERSIONNUMBER"
    val transformFields = (node \ "TRANSFORMFIELD").map(parseTargetField)
    val tableAttributeFields = (node \ "TABLEATTRIBUTE").map(parseTableAttribute)
    val groups = (node \ "GROUP").map(parseGroup)
    val metadataExtensions = (node \ "METADATAEXTENSION").map(parseMetadataExtension)
    val fieldDependencies = (node \ "FIELDDEPENDENCY").map(parseFieldDependency)
    val sourceFields = (node \ "SOURCEFIELD").map(parseSourceField)
    Transformation(
      description,
      name,
      objectVersion,
      reusable,
      typ,
      templateName,
      versionNumber,
      transformFields,
      tableAttributeFields,
      groups,
      metadataExtensions,
      fieldDependencies,
      sourceFields)
  }

  private def parseGroup(fieldNode: Node): Group = {
    Group(
      description = fieldNode \@ "DESCRIPTION",
      name = fieldNode \@ "NAME",
      expression = fieldNode \@ "EXPRESSION",
      order = fieldNode \@ "ORDER",
      `type` = fieldNode \@ "TYPE"
    )
  }

  private def parseFieldDependency(fieldNode: Node): FieldDependency = {
    FieldDependency(
      inputField = fieldNode \@ "INPUTFIELD",
      outputField = fieldNode \@ "OUTPUTFIELD"
    )
  }

  def parseTableAttribute(fieldNode: Node): TableAttribute = {
    TableAttribute(
      name = fieldNode \@ "NAME",
      value = fieldNode \@ "VALUE")
  }

  def parseTargetField(fieldNode: Node): TransformField = {
    TransformField(
      dataType = fieldNode \@ "DATATYPE",
      name = fieldNode \@ "NAME",
      defaultValue = fieldNode \@ "DEFAULTVALUE",
      description = fieldNode \@ "DESCRIPTION",
      group = fieldNode \@ "GROUP",
      expression = fieldNode \@ "EXPRESSION",
      expressionType = fieldNode \@ "EXPRESSIONTYPE",
      mappletGroup = fieldNode \@ "MAPPLETGROUP",
      portType = fieldNode \@ "PORTTYPE",
      pictureText = fieldNode \@ "PICTURETEXT",
      refField = fieldNode \@ "REF_FIELD",
      refInstanceType = fieldNode \@ "REF_INSTANCETYPE",
      refSourceField = fieldNode \@ "REF_SOURCE_FIELD",
      precision = fieldNode \@ "PRECISION",
      scale = fieldNode \@ "SCALE"
    )
  }

  // <TABLEATTRIBUTE NAME ="Is Active" VALUE ="YES"/>
  case class TableAttribute(name: String, value: String)

  case class Transformation(description: String,
                            name: String,
                            objectVersion: String,
                            reusable: String,
                            typ: String,
                            templateName: String,
                            versionNumber: String,
                            transformFields: Seq[TransformField],
                            tableAttributeFields: Seq[TableAttribute],
                            groups: Seq[Group],
                            metadataExtensions: Seq[MetadataExtension],
                            fieldDependencies: Seq[FieldDependency],
                            sourceFields: Seq[SourceField]
                           )

  /*
  <TRANSFORMFIELD DATATYPE ="string" DEFAULTVALUE ="" DESCRIPTION ="" MAPPLETGROUP ="INPUT" NAME ="BANK_ID" PICTURETEXT ="" PORTTYPE ="INPUT" PRECISION ="6" REF_FIELD ="BANK_ID" REF_INSTANCETYPE ="Input Transformation" SCALE ="0"/>
  <TRANSFORMFIELD DATATYPE ="string" DEFAULTVALUE ="" DESCRIPTION ="" NAME ="ID_DATE" PICTURETEXT ="" PORTTYPE ="INPUT" PRECISION ="10" SCALE ="0"/>
   */
  case class TransformField(
                             dataType: String,
                             name: String,
                             defaultValue: String,
                             description: String,
                             group: String,
                             expression: String,
                             expressionType: String,
                             mappletGroup: String,
                             pictureText: String,
                             override val portType: String,
                             precision: String,
                             refField: String,
                             refInstanceType: String,
                             refSourceField: String,
                             scale: String
                           ) extends AbstractField

  /*
  <GROUP DESCRIPTION ="" NAME ="OUTPUT" ORDER ="1" TYPE ="OUTPUT"/>
  <GROUP DESCRIPTION ="" NAME ="EXAMPLE_GROUP_A" ORDER ="2" TYPE ="INPUT"/>
  <GROUP DESCRIPTION ="" NAME ="EXAMPLE_GROUP_B" ORDER ="3" TYPE ="INPUT"/>
   */
  case class Group(description: String,
                   name: String,
                   expression: String,
                   order: String,
                   `type`: String
                  )


  /**
   * <FIELDDEPENDENCY INPUTFIELD ="ID_FIN_OP2" OUTPUTFIELD ="ID_FIN_OP"/>
   * <FIELDDEPENDENCY INPUTFIELD ="NEWFIELD" OUTPUTFIELD ="ID_FIN_OP"/>
   * <FIELDDEPENDENCY INPUTFIELD ="ID_FIN_OP3" OUTPUTFIELD ="ID_FIN_OP"/>
   */
  case class FieldDependency(inputField: String, outputField: String)
}
