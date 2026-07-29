package io.pure360.ipc.xmltojson.recipe.transformation

import io.pure360.ipc.model.recipe.{AbstractItem, Field, StepState}

/**
 * This trait is an abstract factory for creating instances inherited from [[AbstractItem]]
 */
trait AbstractItemFactory {

  def createStepItem(stepState: StepState, fields: Option[List[Field]] = None): AbstractItem
}
