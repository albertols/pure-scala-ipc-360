package io.pure360.ipc.model.recipe

import io.pure360.ipc.model.enums.ScalaType

case class Recipe (steps: List[Step], table: RecipeTable)

case class Step (target: AbstractTarget, sources: List[AbstractSource])

case class Field (name: String,
                  dataType: ScalaType.Value,
                  transformation: RecipeTransformation,
                  dq1b: Option[RecipeTransformationExpression] = None)

case class RecipeTable (targetTableNames: List[String],
                        sourceTableNames: List[String],
                        dq2: Option[RecipeDuplication] = None)

case class RecipeDuplication (keys: List[String])



