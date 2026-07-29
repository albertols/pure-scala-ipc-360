package io.pure360.ipc.xmltojson.recipe.expression

import io.pure360.ipc.model.recipe.{InstanceCursor, RecipeTransformation, StepState}
import io.pure360.ipc.xmltojson.recipe.RecipeGenerator.extractTransformationsFromInput

/**
 * The expression parsing implementation is intended for the general backwards walking algorithm
 */
object TransformationRecursiveParsing extends ExpressionParsing {

  override def processInputField(cursor: InstanceCursor,
                                 fieldName: String): (RecipeTransformation, Option[StepState]) =
    extractTransformationsFromInput(cursor, fieldName)
}
