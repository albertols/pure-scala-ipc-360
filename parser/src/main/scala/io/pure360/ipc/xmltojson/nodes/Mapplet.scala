package io.pure360.ipc.xmltojson.nodes

import io.pure360.ipc.xmltojson.nodes.Transformation._

import scala.xml._


/**
 * <MAPPLET DESCRIPTION ="" ISVALID ="YES" NAME ="mp_ODS_F_PD_KW845T_VAL" OBJECTVERSION ="1" VERSIONNUMBER ="7">
 * <TRANSFORMATION DESCRIPTION ="" NAME ="OUTPUT_ERROR" OBJECTVERSION ="1" REUSABLE ="NO" TYPE ="Output Transformation" VERSIONNUMBER ="2">
 * <TRANSFORMFIELD DATATYPE ="string" DEFAULTVALUE ="" DESCRIPTION ="" NAME ="ID_DATE" PICTURETEXT ="" PORTTYPE ="INPUT" PRECISION ="10" SCALE ="0"/>
 * <TRANSFORMFIELD DATATYPE ="string" DEFAULTVALUE ="" DESCRIPTION ="" NAME ="FILENAME" PICTURETEXT ="" PORTTYPE ="INPUT" PRECISION ="100" SCALE ="0"/>
 * <TRANSFORMFIELD DATATYPE ="string" DEFAULTVALUE ="" DESCRIPTION ="" NAME ="EXAMPLE_ROLE" PICTURETEXT ="" PORTTYPE ="INPUT" PRECISION ="4" SCALE ="0"/>
 * <INSTANCE DESCRIPTION ="" NAME ="EXP_VALIDATION_NOT_NULL_CONTRACT_CODE" REUSABLE ="YES" TRANSFORMATION_NAME ="EXP_VALIDATION_NOT_NULL" TRANSFORMATION_TYPE ="Expression" TYPE ="TRANSFORMATION"/>
 * <CONNECTOR FROMFIELD ="CONTRACT_CODE" FROMINSTANCE ="EXP_ODS_F_PD_KW845T" FROMINSTANCETYPE ="Expression" TOFIELD ="I_STR" TOINSTANCE ="EXP_VALIDATION_NOT_NULL_CONTRACT_CODE" TOINSTANCETYPE ="Expression"/>
 * <MAPPINGVARIABLE DATATYPE ="string" DEFAULTVALUE ="" DESCRIPTION ="" ISEXPRESSIONVARIABLE ="NO" ISPARAM ="YES" NAME ="$$ERROR_SEPARATOR" PRECISION ="2" SCALE ="0" USERDEFINED ="YES"/>
 * <ERPINFO/>
 */
object Mapplet {

  def parseMapplet(node: Node): Mapplet = {
    val description = (node \ "@DESCRIPTION").text
    val isValid = (node \ "@ISVALID").text
    val name = (node \ "@NAME").text
    val objectVersion = (node \ "@OBJECTVERSION").text
    val versionNumber = (node \ "@VERSIONNUMBER").text

    val transformationsNode = node \ "TRANSFORMATION"
    val transformations = transformationsNode.map(Transformation.parseTransformation)

    val instances = (node \ "INSTANCE").map(parseInstance)
    // (transformField \ "TRANSFORMFIELD").map(parseTargetField)
    val connectors = (node \ "CONNECTOR").map(parseConnector)
    val mappingVariables = (node \ "MAPPINGVARIABLE").map(parseMappingVariable)
    val erpInfoNode = node \ "ERPINFO"
    Mapplet(
      description,
      isValid,
      name,
      objectVersion,
      versionNumber,
      transformations,
      instances,
      connectors,
      mappingVariables
    )
  }

  def parseInstance(node: Node): Instance = {
    val description = (node \ "@DESCRIPTION").text
    val name = (node \ "@NAME").text
    val reusable = (node \ "@REUSABLE").text
    val transformationName = (node \ "@TRANSFORMATION_NAME").text
    val transformationType = (node \ "@TRANSFORMATION_TYPE").text
    val tType = (node \ "@TYPE").text
    val tableAttributeFields = (node \ "TABLEATTRIBUTE").map(parseTableAttribute)
    Instance(description, name, reusable, transformationName, transformationType, tType, tableAttributeFields)
  }

  def parseConnector(node: Node): Connector = {
    val fromField = (node \ "@FROMFIELD").text
    val fromInstance = (node \ "@FROMINSTANCE").text
    val fromInstanceType = (node \ "@FROMINSTANCETYPE").text
    val toField = (node \ "@TOFIELD").text
    val toInstance = (node \ "@TOINSTANCE").text
    val toInstanceType = (node \ "@TOINSTANCETYPE").text
    Connector(fromField, fromInstance, fromInstanceType, toField, toInstance, toInstanceType)
  }

  def parseMappingVariable(node: Node): MappingVariable = {
    val aggfunction = (node \ "@AGGFUNCTION").text
    val dataType = (node \ "@DATATYPE").text
    val defaultValue = (node \ "@DEFAULTVALUE").text
    val description = (node \ "@DESCRIPTION").text
    val isExpressionVariable = (node \ "@ISEXPRESSIONVARIABLE").text
    val isParam = (node \ "@ISPARAM").text
    val name = (node \ "@NAME").text
    val precision = (node \ "@PRECISION").text
    val scale = (node \ "@SCALE").text
    val userDefined = (node \ "@USERDEFINED").text
    MappingVariable(aggfunction, dataType, defaultValue, description, isExpressionVariable, isParam, name, precision, scale, userDefined)
  }

  case class Mapplet(
                      description: String,
                      isValid: String,
                      override val name: String,
                      objectVersion: String,
                      versionNumber: String,
                      override val transformations: Seq[Transformation],
                      override val instances: Seq[Instance],
                      override val connectors: Seq[Connector],
                      mappingVariables: Seq[MappingVariable]
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

  case class Instance(
                       description: String,
                       name: String,
                       reusable: String,
                       transformationName: String,
                       transformationType: String,
                       tType: String,
                       tableAttributeFields: Seq[TableAttribute] = Seq.empty
                     )

  case class Connector(
                        fromField: String,
                        fromInstance: String,
                        fromInstanceType: String,
                        toField: String,
                        toInstance: String,
                        toInstanceType: String
                      )

  case class MappingVariable(aggfunction: String,
                             dataType: String,
                             defaultValue: String,
                             description: String,
                             isExpressionVariable: String,
                             isParam: String,
                             name: String,
                             precision: String,
                             scale: String,
                             userDefined: String
                            )


}

