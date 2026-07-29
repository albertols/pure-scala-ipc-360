package io.pure360.ipc.model.recipe

import io.pure360.ipc.xmltojson.recipe.StepMode

case class StepState (stepMode: StepMode.Value, cursor: InstanceCursor)
