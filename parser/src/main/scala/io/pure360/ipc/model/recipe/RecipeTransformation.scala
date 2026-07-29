package io.pure360.ipc.model.recipe

import io.pure360.ipc.model.enums.LookupMatchType


sealed trait RecipeTransformation

case class RecipeTransformationExpression (name: String,
                                           parameters: Option[List[RecipeTransformation]] = None) extends RecipeTransformation

case class RecipeTransformationSource (source: String) extends RecipeTransformation

case class RecipeTransformationValue (value: String) extends RecipeTransformation

case class RecipeTransformationLookup (name: String = "EXP_LOOKUP",
                                       outputField: String,
                                       table: Option[String] = None,
                                       condition: Option[String] = None,
                                       sourceFilter: Option[String] = None,
                                       sqlOverride: Option[String] = None,
                                       matchPolicy: LookupMatchType.Value,
                                       parameters: List[Field]) extends RecipeTransformation