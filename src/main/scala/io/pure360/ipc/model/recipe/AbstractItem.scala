package io.pure360.ipc.model.recipe

/**
 * This abstract trait encapsulates the common features for [[AbstractTarget]] and [[AbstractSource]]
 */
trait AbstractItem {
  def name: String
  def `type`: String
}


