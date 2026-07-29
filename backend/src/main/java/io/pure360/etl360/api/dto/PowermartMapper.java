package io.pure360.etl360.api.dto;

import io.pure360.etl360.api.dto.MappingModelDto.*;
import io.pure360.etl360.service.support.ScalaBridge;
import io.pure360.ipc.xmltojson.nodes.Folder;
import io.pure360.ipc.xmltojson.nodes.Mapping;
import io.pure360.ipc.xmltojson.nodes.Mapplet;
import io.pure360.ipc.xmltojson.nodes.Source;
import io.pure360.ipc.xmltojson.nodes.Target;
import io.pure360.ipc.xmltojson.nodes.Transformation;
import io.pure360.ipc.xmltojson.nodes.XMLRoot;

import java.util.List;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Static mapper from the raw Scala parser node tree (io.pure360.ipc.xmltojson.nodes) to
 * {@link MappingModelDto}. Field-for-field mirror per case class — see MappingModelDto's
 * javadoc for the one documented naming exception.
 */
public final class PowermartMapper {
    private PowermartMapper() {}

    public static MappingModelDto toDto(XMLRoot.Powermart pm) {
        return new MappingModelDto(pm.creationDate(), pm.repositoryVersion(), toRepositoryDto(pm.repository()));
    }

    private static RepositoryDto toRepositoryDto(XMLRoot.Repository r) {
        return new RepositoryDto(r.name(), r.version(), r.codepage(), r.databaseType(), toFolderDto(r.folder()));
    }

    private static FolderDto toFolderDto(Folder.Folder f) {
        return new FolderDto(
            f.name(), f.group(), f.owner(), f.shared(), f.description(), f.permissions(), f.uuid(),
            mapList(f.sources(), PowermartMapper::toSourceDto),
            mapList(f.targets(), PowermartMapper::toTargetDto),
            mapList(f.transformation(), PowermartMapper::toTransformationDto),
            mapList(f.mapplets(), PowermartMapper::toMappletDto),
            mapList(f.mappings(), PowermartMapper::toMappingDto)
        );
    }

    private static SourceDto toSourceDto(Source.Source s) {
        return new SourceDto(
            s.name(), s.businessname(), s.databasetype(), s.dbdname(), s.description(),
            s.objectversion(), s.ownername(), s.versionnumber(),
            mapList(s.sourceFields(), PowermartMapper::toSourceFieldDto),
            mapList(s.metadataExtensions(), PowermartMapper::toMetadataExtensionDto)
        );
    }

    private static SourceFieldDto toSourceFieldDto(Source.SourceField sf) {
        return new SourceFieldDto(
            sf.businessname(), sf.dataType(), sf.description(), sf.fieldnumber(), sf.fieldproperty(),
            sf.fieldType(), sf.hidden(), sf.keyType(), sf.length(), sf.level(), sf.name(), sf.nullable(),
            sf.occurs(), sf.offset(), sf.physicallength(), sf.physicaloffset(), sf.picturetext(),
            sf.precision(), sf.scale(), sf.usageflags(),
            mapList(sf.nestedFields(), PowermartMapper::toSourceFieldDto)
        );
    }

    private static MetadataExtensionDto toMetadataExtensionDto(Source.MetadataExtension me) {
        return new MetadataExtensionDto(
            me.datatype(), me.description(), me.domainname(), me.isclienteditable(), me.isclientvisible(),
            me.isreusable(), me.isshareread(), me.issharewrite(), me.maxlength(), me.name(), me.value(),
            me.vendorname()
        );
    }

    private static TargetDto toTargetDto(Target.Target t) {
        return new TargetDto(
            t.businessName(), t.constraint(), t.databaseType(), t.description(), t.name(),
            t.objectVersion(), t.tableOptions(), t.versionNumber(),
            mapList(t.targetFields(), PowermartMapper::toTargetFieldDto)
        );
    }

    private static TargetFieldDto toTargetFieldDto(Target.TargetField tf) {
        return new TargetFieldDto(
            tf.businessName(), tf.dataType(), tf.description(), tf.fieldNumber(), tf.keyType(),
            tf.name(), tf.nullable(), tf.pictureText(), tf.precision(), tf.scale()
        );
    }

    private static TransformationDto toTransformationDto(Transformation.Transformation tr) {
        return new TransformationDto(
            tr.description(), tr.name(), tr.objectVersion(), tr.reusable(), tr.typ(), tr.templateName(),
            tr.versionNumber(),
            mapList(tr.transformFields(), PowermartMapper::toTransformFieldDto),
            mapList(tr.tableAttributeFields(), PowermartMapper::toTableAttributeDto),
            mapList(tr.groups(), PowermartMapper::toGroupDto),
            mapList(tr.metadataExtensions(), PowermartMapper::toMetadataExtensionDto),
            mapList(tr.fieldDependencies(), PowermartMapper::toFieldDependencyDto),
            mapList(tr.sourceFields(), PowermartMapper::toSourceFieldDto)
        );
    }

    private static TransformFieldDto toTransformFieldDto(Transformation.TransformField f) {
        return new TransformFieldDto(
            f.dataType(), f.name(), f.defaultValue(), f.description(), f.group(), f.expression(),
            f.expressionType(), f.mappletGroup(), f.pictureText(), f.portType(), f.precision(),
            f.refField(), f.refInstanceType(), f.refSourceField(), f.scale()
        );
    }

    private static TableAttributeDto toTableAttributeDto(Transformation.TableAttribute ta) {
        return new TableAttributeDto(ta.name(), ta.value());
    }

    private static GroupDto toGroupDto(Transformation.Group g) {
        return new GroupDto(g.description(), g.name(), g.expression(), g.order(), g.type());
    }

    private static FieldDependencyDto toFieldDependencyDto(Transformation.FieldDependency fd) {
        return new FieldDependencyDto(fd.inputField(), fd.outputField());
    }

    private static MappingDto toMappingDto(Mapping.Mapping m) {
        return new MappingDto(
            m.description(), m.isValid(), m.name(), m.objectVersion(), m.versionNumber(),
            mapList(m.transformations(), PowermartMapper::toTransformationDto),
            mapList(m.instances(), PowermartMapper::toInstanceDto),
            mapList(m.connectors(), PowermartMapper::toConnectorDto),
            mapList(m.targetLoader(), PowermartMapper::toTargetLoaderDto),
            mapList(m.mappingVariables(), PowermartMapper::toMappingVariableDto)
        );
    }

    private static TargetLoaderDto toTargetLoaderDto(Mapping.TargetLoader tl) {
        return new TargetLoaderDto(tl.order(), tl.targetInstance());
    }

    private static MappletDto toMappletDto(Mapplet.Mapplet mp) {
        return new MappletDto(
            mp.description(), mp.isValid(), mp.name(), mp.objectVersion(), mp.versionNumber(),
            mapList(mp.transformations(), PowermartMapper::toTransformationDto),
            mapList(mp.instances(), PowermartMapper::toInstanceDto),
            mapList(mp.connectors(), PowermartMapper::toConnectorDto),
            mapList(mp.mappingVariables(), PowermartMapper::toMappingVariableDto)
        );
    }

    private static InstanceDto toInstanceDto(Mapplet.Instance i) {
        return new InstanceDto(
            i.description(), i.name(), i.reusable(), i.transformationName(), i.transformationType(),
            i.tType(), mapList(i.tableAttributeFields(), PowermartMapper::toTableAttributeDto)
        );
    }

    private static ConnectorDto toConnectorDto(Mapplet.Connector c) {
        return new ConnectorDto(
            c.fromField(), c.fromInstance(), c.fromInstanceType(), c.toField(), c.toInstance(), c.toInstanceType()
        );
    }

    private static MappingVariableDto toMappingVariableDto(Mapplet.MappingVariable mv) {
        return new MappingVariableDto(
            mv.aggfunction(), mv.dataType(), mv.defaultValue(), mv.description(), mv.isExpressionVariable(),
            mv.isParam(), mv.name(), mv.precision(), mv.scale(), mv.userDefined()
        );
    }

    private static <S, D> List<D> mapList(scala.collection.Seq<S> seq, Function<S, D> fn) {
        return ScalaBridge.list(seq).stream().map(fn).collect(Collectors.toList());
    }
}
