package io.pure360.ipc.xmltojson.nodes

import scala.xml._

object Source {

  def parseSource(node: NodeSeq): Source = {
    val name = (node \ "@NAME").text
    val businessname = (node \ "@BUSINESSNAME").text
    val databasetype = (node \ "@DATABASETYPE").text
    val dbdname = (node \ "@DBDNAME").text
    val description = (node \ "@DESCRIPTION").text
    val objectversion = (node \ "@OBJECTVERSION").text
    val ownername = (node \ "@OWNERNAME").text
    val versionnumber = (node \ "@VERSIONNUMBER").text

    val sourceFields = (node \ "SOURCEFIELD").map(parseSourceField)

    val metadataExtensions = (node \ "METADATAEXTENSION").map(parseMetadataExtension)

    Source(
      name,
      businessname,
      databasetype,
      dbdname,
      description,
      objectversion,
      ownername,
      versionnumber,
      sourceFields,
      metadataExtensions
    )
  }

  def parseSourceField(node: Node): SourceField = {
    val businessname = (node \ "@BUSINESSNAME").text
    val datatype = (node \ "@DATATYPE").text
    val description = (node \ "@DESCRIPTION").text
    val fieldnumber = (node \ "@FIELDNUMBER").text
    val fieldproperty = (node \ "@FIELDPROPERTY").text
    val fieldtype = (node \ "@FIELDTYPE").text
    val hidden = (node \ "@HIDDEN").text
    val keytype = (node \ "@KEYTYPE").text
    val length = (node \ "@LENGTH").text
    val level = (node \ "@LEVEL").text
    val name = (node \ "@NAME").text
    val nullable = (node \ "@NULLABLE").text
    val occurs = (node \ "@OCCURS").text
    val offset = (node \ "@OFFSET").text
    val physicallength = (node \ "@PHYSICALLENGTH").text
    val physicaloffset = (node \ "@PHYSICALOFFSET").text
    val picturetext = (node \ "@PICTURETEXT").text
    val precision = (node \ "@PRECISION").text
    val scale = (node \ "@SCALE").text
    val usageflags = (node \ "@USAGE_FLAGS").text
    val nestedFields = (node \ "SOURCEFIELD").map(parseSourceField)

    SourceField(
      businessname,
      datatype,
      description,
      fieldnumber,
      fieldproperty,
      fieldtype,
      hidden,
      keytype,
      length,
      level,
      name,
      nullable,
      occurs,
      offset,
      physicallength,
      physicaloffset,
      picturetext,
      precision,
      scale,
      usageflags,
      nestedFields
    )
  }

  def parseMetadataExtension(node: Node): MetadataExtension = {
    val datatype = (node \ "@DATATYPE").text
    val description = (node \ "@DESCRIPTION").text
    val domainname = (node \ "@DOMAINNAME").text
    val isclienteditable = (node \ "@ISCLIENTEDITABLE").text
    val isclientvisible = (node \ "@ISCLIENTVISIBLE").text
    val isreusable = (node \ "@ISREUSABLE").text
    val isshareread = (node \ "@ISSHAREREAD").text
    val issharewrite = (node \ "@ISSHAREWRITE").text
    val maxlength = (node \ "@MAXLENGTH").text
    val name = (node \ "@NAME").text
    val value = (node \ "@VALUE").text
    val vendorname = (node \ "@VENDORNAME").text

    MetadataExtension(
      datatype,
      description,
      domainname,
      isclienteditable,
      isclientvisible,
      isreusable,
      isshareread,
      issharewrite,
      maxlength,
      name,
      value,
      vendorname
    )
  }

  case class Source(
                     name: String,
                     businessname: String,
                     databasetype: String,
                     dbdname: String,
                     description: String,
                     objectversion: String,
                     ownername: String,
                     versionnumber: String,
                     sourceFields: Seq[SourceField],
                     metadataExtensions: Seq[MetadataExtension]
                   )

  case class SourceField(
                          businessname: String,
                          dataType: String,
                          description: String,
                          fieldnumber: String,
                          fieldproperty: String,
                          override val fieldType: String,
                          hidden: String,
                          keyType: String,
                          length: String,
                          level: String,
                          name: String,
                          override val nullable: String,
                          occurs: String,
                          offset: String,
                          physicallength: String,
                          physicaloffset: String,
                          picturetext: String,
                          precision: String,
                          scale: String,
                          usageflags: String,
                          override val nestedFields: Seq[SourceField]
                        ) extends AbstractField

  case class MetadataExtension(
                                datatype: String,
                                description: String,
                                domainname: String,
                                isclienteditable: String,
                                isclientvisible: String,
                                isreusable: String,
                                isshareread: String,
                                issharewrite: String,
                                maxlength: String,
                                name: String,
                                value: String,
                                vendorname: String
                              )
}
