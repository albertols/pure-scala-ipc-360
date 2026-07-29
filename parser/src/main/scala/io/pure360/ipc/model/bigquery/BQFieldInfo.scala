package io.pure360.ipc.model.bigquery

case class BQFieldInfo(
                      name: String,
                      `type`: String,
                      //subFields: FieldList,
                      mode: String,
                      description: Option[String],
                      //policyTags: PolicyTags,
                      maxLength: Option[Long],
                      scale: Option[Long],
                      precision: Option[Long],
                      defaultValueExpression: Option[String],
                      collation: Option[String]
                    )
