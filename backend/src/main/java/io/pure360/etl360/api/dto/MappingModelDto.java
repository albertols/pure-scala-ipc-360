package io.pure360.etl360.api.dto;

import java.util.List;

/**
 * Semantic model DTO tree for the raw-parsed Powermart XML (via the in-JVM Scala parser).
 *
 * Every nested record mirrors its corresponding Scala case class in
 * {@code parser/src/main/scala/io/pure360/ipc/xmltojson/nodes/} field-for-field, same names,
 * with the single documented exception: {@code Folder.transformation} (Scala, singular) is
 * exposed here as {@code FolderDto.transformations} (plural).
 *
 * This is a raw/lossless mirror of the parser's node model — not the recipe-oriented,
 * renamed view produced by {@code XMLReplacementExecutor.preparePowermart}.
 */
public record MappingModelDto(String creationDate, String repositoryVersion, RepositoryDto repository) {

    // ---- XMLRoot.scala ----

    public record RepositoryDto(String name, String version, String codepage, String databaseType, FolderDto folder) {}

    // ---- Folder.scala ----

    public record FolderDto(
        String name,
        String group,
        String owner,
        String shared,
        String description,
        String permissions,
        String uuid,
        List<SourceDto> sources,
        List<TargetDto> targets,
        List<TransformationDto> transformations,
        List<MappletDto> mapplets,
        List<MappingDto> mappings
    ) {}

    // ---- Source.scala ----

    public record SourceDto(
        String name,
        String businessname,
        String databasetype,
        String dbdname,
        String description,
        String objectversion,
        String ownername,
        String versionnumber,
        List<SourceFieldDto> sourceFields,
        List<MetadataExtensionDto> metadataExtensions
    ) {}

    public record SourceFieldDto(
        String businessname,
        String dataType,
        String description,
        String fieldnumber,
        String fieldproperty,
        String fieldType,
        String hidden,
        String keyType,
        String length,
        String level,
        String name,
        String nullable,
        String occurs,
        String offset,
        String physicallength,
        String physicaloffset,
        String picturetext,
        String precision,
        String scale,
        String usageflags,
        List<SourceFieldDto> nestedFields
    ) {}

    public record MetadataExtensionDto(
        String datatype,
        String description,
        String domainname,
        String isclienteditable,
        String isclientvisible,
        String isreusable,
        String isshareread,
        String issharewrite,
        String maxlength,
        String name,
        String value,
        String vendorname
    ) {}

    // ---- Target.scala ----

    public record TargetDto(
        String businessName,
        String constraint,
        String databaseType,
        String description,
        String name,
        String objectVersion,
        String tableOptions,
        String versionNumber,
        List<TargetFieldDto> targetFields
    ) {}

    public record TargetFieldDto(
        String businessName,
        String dataType,
        String description,
        int fieldNumber,
        String keyType,
        String name,
        String nullable,
        String pictureText,
        String precision,
        String scale
    ) {}

    // ---- Transformation.scala ----

    public record TableAttributeDto(String name, String value) {}

    public record TransformationDto(
        String description,
        String name,
        String objectVersion,
        String reusable,
        String typ,
        String templateName,
        String versionNumber,
        List<TransformFieldDto> transformFields,
        List<TableAttributeDto> tableAttributeFields,
        List<GroupDto> groups,
        List<MetadataExtensionDto> metadataExtensions,
        List<FieldDependencyDto> fieldDependencies,
        List<SourceFieldDto> sourceFields
    ) {}

    public record TransformFieldDto(
        String dataType,
        String name,
        String defaultValue,
        String description,
        String group,
        String expression,
        String expressionType,
        String mappletGroup,
        String pictureText,
        String portType,
        String precision,
        String refField,
        String refInstanceType,
        String refSourceField,
        String scale
    ) {}

    public record GroupDto(String description, String name, String expression, String order, String type) {}

    public record FieldDependencyDto(String inputField, String outputField) {}

    // ---- Mapping.scala ----

    public record TargetLoaderDto(String order, String targetInstance) {}

    public record MappingDto(
        String description,
        String isValid,
        String name,
        String objectVersion,
        String versionNumber,
        List<TransformationDto> transformations,
        List<InstanceDto> instances,
        List<ConnectorDto> connectors,
        List<TargetLoaderDto> targetLoader,
        List<MappingVariableDto> mappingVariables
    ) {}

    // ---- Mapplet.scala ----

    public record MappletDto(
        String description,
        String isValid,
        String name,
        String objectVersion,
        String versionNumber,
        List<TransformationDto> transformations,
        List<InstanceDto> instances,
        List<ConnectorDto> connectors,
        List<MappingVariableDto> mappingVariables
    ) {}

    public record InstanceDto(
        String description,
        String name,
        String reusable,
        String transformationName,
        String transformationType,
        String tType,
        List<TableAttributeDto> tableAttributeFields
    ) {}

    public record ConnectorDto(
        String fromField,
        String fromInstance,
        String fromInstanceType,
        String toField,
        String toInstance,
        String toInstanceType
    ) {}

    public record MappingVariableDto(
        String aggfunction,
        String dataType,
        String defaultValue,
        String description,
        String isExpressionVariable,
        String isParam,
        String name,
        String precision,
        String scale,
        String userDefined
    ) {}
}
