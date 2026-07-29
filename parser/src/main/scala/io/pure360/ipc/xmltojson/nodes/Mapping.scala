package io.pure360.ipc.xmltojson.nodes

import io.pure360.ipc.xmltojson.nodes.Transformation._

import scala.xml._


/**
 * <MAPPING DESCRIPTION ="" ISVALID ="YES" NAME ="m_ODS_F_PD_KW845T" OBJECTVERSION ="1" VERSIONNUMBER ="8">
 * <TRANSFORMATION DESCRIPTION ="" NAME ="SEQ_ODS_F_PD_KW845T" OBJECTVERSION ="1" REUSABLE ="NO" TYPE ="Sequence" VERSIONNUMBER ="2">
 * <TRANSFORMFIELD DATATYPE ="bigint" DEFAULTVALUE ="ERROR(&apos;transformation error&apos;)" DESCRIPTION ="" NAME ="NEXTVAL" PICTURETEXT ="" PORTTYPE ="OUTPUT" PRECISION ="19" SCALE ="0"/>
 * <TRANSFORMFIELD DATATYPE ="bigint" DEFAULTVALUE ="ERROR(&apos;transformation error&apos;)" DESCRIPTION ="" NAME ="CURRVAL" PICTURETEXT ="" PORTTYPE ="OUTPUT" PRECISION ="19" SCALE ="0"/>
 * <TABLEATTRIBUTE NAME ="Start Value" VALUE ="1"/>
 * <INSTANCE DESCRIPTION ="" NAME ="CONTROL_ERRORS_TARGET" TRANSFORMATION_NAME ="CONTROL_ERRORS_TARGET" TRANSFORMATION_TYPE ="Target Definition" TYPE ="TARGET"/>
 * <CONNECTOR FROMFIELD ="ID_DATE2" FROMINSTANCE ="mp_ODS_F_PD_KW845T_VAL" FROMINSTANCETYPE ="Mapplet" TOFIELD ="ID_DATE" TOINSTANCE ="CONTROL_ERRORS_TARGET" TOINSTANCETYPE ="Target Definition"/>
 * <TARGETLOADORDER ORDER ="1" TARGETINSTANCE ="CONTROL_ERRORS_TARGET"/>
 * <MAPPINGVARIABLE AGGFUNCTION ="MAX" DATATYPE ="string" DEFAULTVALUE ="" DESCRIPTION ="" ISEXPRESSIONVARIABLE ="NO" ISPARAM ="NO" NAME ="$$LKP_DATE_SQL" PRECISION ="300" SCALE ="0" USERDEFINED ="YES"/>
 * <ERPINFO/>
 */
object Mapping {

  def parseMapping(node: Node): Mapping = {
    val description = (node \ "@DESCRIPTION").text
    val isValid = (node \ "@ISVALID").text
    val name = (node \ "@NAME").text
    val objectVersion = (node \ "@OBJECTVERSION").text
    val versionNumber = (node \ "@VERSIONNUMBER").text

    val transformationsNode = node \ "TRANSFORMATION"
    val transformations = transformationsNode.map(Transformation.parseTransformation)
    val instances = (node \ "INSTANCE").map(Mapplet.parseInstance)
    val connectors = (node \ "CONNECTOR").map(Mapplet.parseConnector)
    val mappingVariables = (node \ "MAPPINGVARIABLE").map(Mapplet.parseMappingVariable)
    val targetloadorder = (node \ "TARGETLOADORDER").map(parseTargetLoader)
    val erpInfoNode = node \ "ERPINFO"
    Mapping(
      description,
      isValid,
      name,
      objectVersion,
      versionNumber,
      transformations,
      instances,
      connectors,
      targetloadorder,
      mappingVariables
    )
  }

  def parseTargetLoader(node: Node): TargetLoader = {
    val order = (node \ "@ORDER").text
    val targetInstance = (node \ "@TARGETINSTANCE").text
    TargetLoader(order, targetInstance)
  }

  case class TargetLoader(order: String, targetInstance: String)

  case class Mapping(
                      description: String,
                      isValid: String,
                      override val name: String,
                      objectVersion: String,
                      versionNumber: String,
                      override val transformations: Seq[Transformation],
                      override val instances: Seq[Mapplet.Instance],
                      override val connectors: Seq[Mapplet.Connector],
                      targetLoader: Seq[TargetLoader],
                      mappingVariables: Seq[Mapplet.MappingVariable]
                      //erpInfo: ErpInfo
                    ) extends Mappable {
    override def toString: String = s"description=$description, isValid=$isValid, name=$name, objectVersion=$objectVersion, " +
      s"versionNumber=$versionNumber, transformations=${
        transformations.seq.map {
          t =>
            s"\n[TRANSFORMATION] description=${t.description}, name=${t.name}, objectVersion=${t.objectVersion}, reusable=${t.reusable}, type=${t.typ}, versionNumber=${t.versionNumber}\n\t\t" +
              s"${t.transformFields.map { field => field }.mkString("\n\t\t")}"
        }.mkString("\n")
      }\n" +
      s"\ninstances=${
        instances.seq.map {
          instance => s"\n\t\t[INSTANCE] $instance"
        }
      }\n " +
      s"\nconnectors=${
        connectors.seq.map {
          connector => s"\n\t\t[CONNECTOR] $connector"
        }
      }\n " +
      s"\nmappingVariables=${
        mappingVariables.seq.map {
          mappingvariable => s"\n\t\t[MAPPINGVARIABLE] $mappingvariable"
        }
      }\n "
  }
}

