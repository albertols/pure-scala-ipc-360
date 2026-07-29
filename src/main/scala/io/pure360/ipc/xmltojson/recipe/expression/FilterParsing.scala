package io.pure360.ipc.xmltojson.recipe.expression

import io.pure360.ipc.model.recipe.{InstanceCursor, RecipeTransformation, RecipeTransformationSource, StepState}

/**
 * This expression parsing algorithm is intended for filter condition parsing where all involved fields are members of
 * the current transformation and we do not need to go outside and build a chain to a previous source transformation
 */
object FilterParsing extends ExpressionParsing {

  override def processInputField(cursor: InstanceCursor, fieldName: String): (RecipeTransformation, Option[StepState]) =
    (RecipeTransformationSource(fieldName), None)
}
