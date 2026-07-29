package io.pure360.ipc.json

import io.pure360.ipc.model.bigquery.BQFieldInfo
import io.pure360.ipc.model.enums.{LookupMatchType, ScalaType}
import io.pure360.ipc.model.recipe._
import io.pure360.ipc.model.sql.{SqlContent, TransformationContent}
import io.circe._
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import io.circe.syntax._

/**
 * This object contains implicit definitions for JSON encoders and decoders
 */
object JsonCodecs {

  // Encoders
  implicit val recipeEncoder: Encoder[Recipe] = deriveEncoder
  implicit val recipeStepEncoder: Encoder[Step] = deriveEncoder
  implicit val recipeFieldEncoder: Encoder[Field] = deriveEncoder
  implicit val recipeScalaTypeValueEncoder: Encoder[ScalaType.Value] = Encoder.encodeEnumeration(ScalaType)
  implicit val recipeTableEncoder: Encoder[RecipeTable] = deriveEncoder
  implicit val recipeDuplicationEncoder: Encoder[RecipeDuplication] = deriveEncoder
  implicit val recipeTransformationEncoder: Encoder[RecipeTransformation] = Encoder.instance {
    case expression: RecipeTransformationExpression => expression.asJson
    case source: RecipeTransformationSource => source.asJson
    case value: RecipeTransformationValue => value.asJson
    case lookup: RecipeTransformationLookup => lookup.asJson
    case _ => Json.Null
  }
  implicit val recipeTransformationExpressionEncoder: Encoder[RecipeTransformationExpression] = deriveEncoder
  implicit val recipeTransformationSourceEncoder: Encoder[RecipeTransformationSource] = deriveEncoder
  implicit val recipeTransformationValueEncoder: Encoder[RecipeTransformationValue] = deriveEncoder
  implicit val recipeTransformationLookupEncoder: Encoder[RecipeTransformationLookup] = deriveEncoder
  implicit val recipeLookupMatchTypeEncoder: Encoder[LookupMatchType.Value] = Encoder.encodeEnumeration(LookupMatchType)
  implicit val recipeSourceEncoder: Encoder[AbstractSource] = Encoder.instance {
    case table: TableSource => table.asJson
    case union: UnionSource => union.asJson
    case sourceQualifier: SourceQualifierSource => sourceQualifier.asJson
    case filterSource: FilterSource => filterSource.asJson
    case joinerSource: JoinerSource => joinerSource.asJson
    case aggregatorSource: AggregatorSource => aggregatorSource.asJson
    case routerSource: RouterSource => routerSource.asJson
    case normalizerSource: NormalizerSource => normalizerSource.asJson
    case javaSource: JavaSource => javaSource.asJson
    case storedProcedureSource: StoredProcedureSource => storedProcedureSource.asJson
    case _ => Json.Null
  }
  implicit val recipeTableSourceEncoder: Encoder[TableSource] = deriveEncoder
  implicit val recipeUnionSourceEncoder: Encoder[UnionSource] = deriveEncoder
  implicit val recipeUnionTableEncoder: Encoder[UnionTable] = deriveEncoder
  implicit val recipeUnionFieldMap: Encoder[FieldMap] = deriveEncoder
  implicit val recipeSourceQualifierSourceEncoder: Encoder[SourceQualifierSource] = deriveEncoder
  implicit val recipeFilterSourceEncoder: Encoder[FilterSource] = deriveEncoder
  implicit val recipeJoinerSourceEncoder: Encoder[JoinerSource] = deriveEncoder
  implicit val recipeAggregatorSourceEncoder: Encoder[AggregatorSource] = deriveEncoder
  implicit val recipeRouterSourceEncoder: Encoder[RouterSource] = deriveEncoder
  implicit val recipeNormalizerSourceEncoder: Encoder[NormalizerSource] = deriveEncoder
  implicit val recipeJavaSourceEncoder: Encoder[JavaSource] = deriveEncoder
  implicit val recipeStoredProcedureEncoder: Encoder[StoredProcedureSource] = deriveEncoder
  implicit val recipeTargetEncoder: Encoder[AbstractTarget] = Encoder.instance {
    case table: TableTarget => table.asJson
    case union: UnionInputTarget => union.asJson
    case sourceQualifier: SourceQualifierTarget => sourceQualifier.asJson
    case filterTarget: FilterTarget => filterTarget.asJson
    case joinerTarget: JoinerTarget => joinerTarget.asJson
    case aggregatorTarget: AggregatorTarget => aggregatorTarget.asJson
    case routerTarget: RouterTarget => routerTarget.asJson
    case normalizerTarget: NormalizerTarget => normalizerTarget.asJson
    case javaTarget: JavaTarget => javaTarget.asJson
    case storedProcedureTarget: StoredProcedureTarget => storedProcedureTarget.asJson
    case _ => Json.Null
  }
  implicit val recipeTableTargetEncoder: Encoder[TableTarget] = deriveEncoder
  implicit val recipeUnionTargetEncoder: Encoder[UnionInputTarget] = deriveEncoder
  implicit val recipeSourceQualifierTargetEncoder: Encoder[SourceQualifierTarget] = deriveEncoder
  implicit val recipeFilterTargetEncoder: Encoder[FilterTarget] = deriveEncoder
  implicit val recipeJoinerTargetEncoder: Encoder[JoinerTarget] = deriveEncoder
  implicit val recipeAggregatorTargetEncoder: Encoder[AggregatorTarget] = deriveEncoder
  implicit val recipeRouterTargetEncoder: Encoder[RouterTarget] = deriveEncoder
  implicit val recipeRouterGroupEncoder: Encoder[RouterGroup] = deriveEncoder
  implicit val recipeNormalizerTargetEncoder: Encoder[NormalizerTarget] = deriveEncoder
  implicit val recipeNormalizedFieldEncoder: Encoder[NormalizedField] = deriveEncoder
  implicit val recipeJavaTargetEncoder: Encoder[JavaTarget] = deriveEncoder
  implicit val recipeStoredProcedureTargetEncoder: Encoder[StoredProcedureTarget] = deriveEncoder
  //SqlContent encoders
  implicit val sqlContentEncoder: Encoder[SqlContent] = deriveEncoder
  implicit val sqlContentTransformationEncoder: Encoder[TransformationContent] = deriveEncoder

  implicit val fieldInfoDecoder: Decoder[BQFieldInfo] = deriveDecoder

  // Decoders: Recipe (tree)
  implicit val recipeDecoder: Decoder[Recipe] = deriveDecoder
  implicit val recipeTableDecoder: Decoder[RecipeTable] = deriveDecoder
  implicit val recipeDuplicationDecoder: Decoder[RecipeDuplication] = deriveDecoder
  implicit val recipeStepDecoder: Decoder[Step] = deriveDecoder
  implicit val recipeFieldDecoder: Decoder[Field] = deriveDecoder
  implicit val recipeScalaTypeDecoder: Decoder[ScalaType.Value] = Decoder.decodeEnumeration(ScalaType)

  // RecipeTransformation
  implicit val recipeTransformationExpressionDecoder: Decoder[RecipeTransformationExpression] = deriveDecoder
  implicit val recipeTransformationSourceDecoder: Decoder[RecipeTransformationSource] = deriveDecoder
  implicit val recipeTransformationValueDecoder: Decoder[RecipeTransformationValue] = deriveDecoder
  implicit val recipeTransformationLookupDecoder: Decoder[RecipeTransformationLookup] = deriveDecoder
  implicit val recipeLookupMatchTypeDecoder: Decoder[LookupMatchType.Value] = Decoder.decodeEnumeration(LookupMatchType)
  implicit val recipeTransformationDecoder: Decoder[RecipeTransformation] = (c: HCursor) => {
    if (c.keys.get.size == 1) {
      c.keys.get.head match {
        case "source" => c.as[RecipeTransformationSource]
        case "value" => c.as[RecipeTransformationValue]
        case "name" => c.as[RecipeTransformationExpression]
        case _ => Left(DecodingFailure(s"Unknown RecipeTransformation with key: ${c.keys.get.head}", c.history))
      }
    }
    else if (c.keys.get.size == 2) c.as[RecipeTransformationExpression]
    else c.as[RecipeTransformationLookup]
  }

  // AbstractTarget
  implicit val tableTargetDecoder: Decoder[TableTarget] = deriveDecoder
  implicit val unionInputTargetDecoder: Decoder[UnionInputTarget] = deriveDecoder
  implicit val sourceQualifierTargetDecoder: Decoder[SourceQualifierTarget] = deriveDecoder
  implicit val filterTargetDecoder: Decoder[FilterTarget] = deriveDecoder
  implicit val joinerTargetDecoder: Decoder[JoinerTarget] = deriveDecoder
  implicit val aggregatorTargetDecoder: Decoder[AggregatorTarget] = deriveDecoder
  implicit val routerTargetDecoder: Decoder[RouterTarget] = deriveDecoder
  implicit val routerGroupDecoder: Decoder[RouterGroup] = deriveDecoder
  implicit val normalizerTargetDecoder: Decoder[NormalizerTarget] = deriveDecoder
  implicit val normalizedFieldDecoder: Decoder[NormalizedField] = deriveDecoder
  implicit val javaTargetDecoder: Decoder[JavaTarget] = deriveDecoder
  implicit val storedProcedureTargetDecoder: Decoder[StoredProcedureTarget] = deriveDecoder
  implicit val abstractTargetDecoder: Decoder[AbstractTarget] = (c: HCursor) => {
    c.downField("type").as[String].flatMap {
      case "table" => c.as[TableTarget]
      case "unionInput" => c.as[UnionInputTarget]
      case "sourceQualifier" => c.as[SourceQualifierTarget]
      case "filter" => c.as[FilterTarget]
      case "joinerInput" => c.as[JoinerTarget]
      case "aggregator" => c.as[AggregatorTarget]
      case "router" => c.as[RouterTarget]
      case "normalizer" => c.as[NormalizerTarget]
      case "java" => c.as[JavaTarget]
      case "storedProcedure" => c.as[StoredProcedureTarget]
      case other => Left(DecodingFailure(s"Unknown AbstractTarget type: $other", c.history))
    }
  }

  // SourceTarget
  implicit val unionSourceDecoder: Decoder[UnionSource] = deriveDecoder
  implicit val unionTableDecoder: Decoder[UnionTable] = deriveDecoder
  implicit val unionFieldMap: Decoder[FieldMap] = deriveDecoder
  implicit val sourceQualifierSourceDecoder: Decoder[SourceQualifierSource] = deriveDecoder
  implicit val tableSourceDecoder: Decoder[TableSource] = deriveDecoder
  implicit val filterSourceDecoder: Decoder[FilterSource] = deriveDecoder
  implicit val joinerSourceDecoder: Decoder[JoinerSource] = deriveDecoder
  implicit val aggregatorSourceDecoder: Decoder[AggregatorSource] = deriveDecoder
  implicit val routerSourceDecoder: Decoder[RouterSource] = deriveDecoder
  implicit val normalizerSourceDecoder: Decoder[NormalizerSource] = deriveDecoder
  implicit val javaSourceDecoder: Decoder[JavaSource] = deriveDecoder
  implicit val storedProcedureSourceDecoder: Decoder[StoredProcedureSource] = deriveDecoder
  implicit val abstractSourceDecoder: Decoder[AbstractSource] = (c: HCursor) => {
    c.downField("type").as[String].flatMap {
      case "union" => c.as[UnionSource]
      case "sourceQualifier" => c.as[SourceQualifierSource]
      case "table" => c.as[TableSource]
      case "filter" => c.as[FilterSource]
      case "joiner" => c.as[JoinerSource]
      case "aggregator" => c.as[AggregatorSource]
      case "router" => c.as[RouterSource]
      case "normalizer" => c.as[NormalizerSource]
      case "java" => c.as[JavaSource]
      case "storedProcedure" => c.as[StoredProcedureSource]
      case other => Left(DecodingFailure(s"Unknown SourceTarget type: $other", c.history))
    }
  }
  // SqlContent decoders
  implicit val sqlContentDecoder: Decoder[SqlContent] = deriveDecoder
  implicit val sqlContentTransformationDecoder: Decoder[TransformationContent] = deriveDecoder

}
