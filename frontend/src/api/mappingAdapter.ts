import type { components } from './types.gen'
import type { Connection, ETLNode, NodeType, Port } from '../types'

export type MappingModelT = components['schemas']['MappingModelDto']
type MappingDto = components['schemas']['MappingDto']
type InstanceDto = components['schemas']['InstanceDto']
type TransformationDto = components['schemas']['TransformationDto']
type SourceDto = components['schemas']['SourceDto']
type TargetDto = components['schemas']['TargetDto']
type ConnectorDto = components['schemas']['ConnectorDto']

export interface CanvasGraph {
  nodes: ETLNode[]
  connections: Connection[]
  mappingNames: string[]
  renderedMapping: string
}

/** IPC transformationType/typ string -> canvas NodeType (rule 2). */
const KIND: Record<string, NodeType> = {
  'Source Definition': 'source',
  'Target Definition': 'target',
  'Source Qualifier': 'sq',
  Expression: 'expression',
  'Lookup Procedure': 'lookup',
  Joiner: 'joiner',
  Aggregator: 'aggregator',
  Router: 'router',
  Filter: 'filter',
}

/** Canonical chip abbreviation per known kind. */
const ABBR: Record<NodeType, string> = {
  source: 'SRC',
  target: 'TGT',
  sq: 'SQ',
  expression: 'EXP',
  lookup: 'LKP',
  joiner: 'JNR',
  aggregator: 'AGG',
  router: 'RTR',
  filter: 'FLT',
}

/** Derive a 3-letter fallback label from an arbitrary IPC type string. */
function fallbackLabel(typ: string): string {
  return typ.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()
}

function isBlank(s: string | undefined | null): boolean {
  return s === undefined || s === null || s === ''
}

function portDirection(portType: string | undefined): Port['direction'] {
  if (portType === 'INPUT') return 'IN'
  if (portType === 'OUTPUT') return 'OUT'
  if (portType === 'INPUT/OUTPUT') return 'IN/OUT'
  return 'IN/OUT'
}

/** Add every non-blank scalar string field of an object into a properties bag. */
function collectScalarProps(props: Record<string, string>, obj: Record<string, unknown> | undefined | null): void {
  if (!obj) return
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== 'string') continue
    if (isBlank(value)) continue
    props[key] = value
  }
}

function findTransformation(
  mapping: MappingDto,
  folder: components['schemas']['FolderDto'] | undefined,
  transformationName: string | undefined,
): TransformationDto | undefined {
  if (isBlank(transformationName)) return undefined
  const inMapping = (mapping.transformations ?? []).find(t => t.name === transformationName)
  if (inMapping) return inMapping
  return (folder?.transformations ?? []).find(t => t.name === transformationName)
}

function findSource(folder: components['schemas']['FolderDto'] | undefined, instance: InstanceDto): SourceDto | undefined {
  const byTransformationName = (folder?.sources ?? []).find(s => s.name === instance.transformationName)
  if (byTransformationName) return byTransformationName
  return (folder?.sources ?? []).find(s => s.name === instance.name)
}

function findTarget(folder: components['schemas']['FolderDto'] | undefined, instance: InstanceDto): TargetDto | undefined {
  const byTransformationName = (folder?.targets ?? []).find(t => t.name === instance.transformationName)
  if (byTransformationName) return byTransformationName
  return (folder?.targets ?? []).find(t => t.name === instance.name)
}

function sourceDataType(field: components['schemas']['SourceFieldDto']): string {
  const dataType = field.dataType ?? ''
  const precision = field.precision
  if (isBlank(precision)) return dataType
  const scale = field.scale
  const scalePart = !isBlank(scale) && scale !== '0' ? `,${scale}` : ''
  return `${dataType}(${precision}${scalePart})`
}

function targetDataType(field: components['schemas']['TargetFieldDto']): string {
  const dataType = field.dataType ?? ''
  const precision = field.precision
  if (isBlank(precision)) return dataType
  const scale = field.scale
  const scalePart = !isBlank(scale) && scale !== '0' ? `,${scale}` : ''
  return `${dataType}(${precision}${scalePart})`
}

export function toCanvas(model: MappingModelT, mappingPath: string): CanvasGraph {
  const folder = model.repository?.folder
  const mappings = folder?.mappings ?? []
  const mappingNames = mappings.map(m => m.name ?? '')

  if (mappings.length === 0) {
    return { nodes: [], connections: [], mappingNames: [], renderedMapping: '' }
  }

  const basename = mappingPath.split('/').pop() ?? mappingPath
  const mapping = mappings.find(m => m.name === basename) ?? mappings[0]!
  const renderedMapping = mapping.name ?? ''
  const file = `${basename}.xml`

  const nodes: ETLNode[] = (mapping.instances ?? []).map(instance =>
    toNode(instance, mapping, folder, file),
  )

  const nodeById = new Map(nodes.map(n => [n.id, n]))
  const connections: Connection[] = []

  for (const connector of mapping.connectors ?? []) {
    const conn = toConnection(connector)
    if (!conn) continue
    const fromNode = nodeById.get(conn.fromNode)
    const toNode = nodeById.get(conn.toNode)
    if (!fromNode || !toNode) continue
    connections.push(conn)
    markLinked(fromNode, conn.fromPort)
    markLinked(toNode, conn.toPort)
  }

  return { nodes, connections, mappingNames, renderedMapping }
}

function markLinked(node: ETLNode, portName: string): void {
  const port = node.ports.find(p => p.name === portName)
  if (port) port.linked = true
}

function toConnection(connector: ConnectorDto): Connection | undefined {
  const fromNode = connector.fromInstance
  const toNode = connector.toInstance
  if (isBlank(fromNode) || isBlank(toNode)) return undefined
  return {
    fromNode: fromNode as string,
    fromPort: connector.fromField ?? '',
    toNode: toNode as string,
    toPort: connector.toField ?? '',
  }
}

function toNode(
  instance: InstanceDto,
  mapping: MappingDto,
  folder: components['schemas']['FolderDto'] | undefined,
  file: string,
): ETLNode {
  const id = instance.name ?? ''
  const name = instance.name ?? ''
  const properties: Record<string, string> = {}
  collectScalarProps(properties, instance as unknown as Record<string, unknown>)

  // transformationType is the primary type signal; tType is a coarse fallback
  // (SOURCE/TARGET/TRANSFORMATION) used only when transformationType is blank.
  const instanceType = !isBlank(instance.transformationType)
    ? instance.transformationType
    : instance.tType === 'SOURCE'
      ? 'Source Definition'
      : instance.tType === 'TARGET'
        ? 'Target Definition'
        : instance.transformationType

  if (instanceType === 'Source Definition') {
    const source = findSource(folder, instance)
    collectScalarProps(properties, source as unknown as Record<string, unknown>)
    const ports: Port[] = (source?.sourceFields ?? []).map(field => ({
      name: field.name ?? '',
      dataType: sourceDataType(field),
      direction: 'OUT' as const,
    }))
    return { id, type: 'source', label: ABBR.source, name, x: 0, y: 0, ports, properties, file }
  }

  if (instanceType === 'Target Definition') {
    const target = findTarget(folder, instance)
    collectScalarProps(properties, target as unknown as Record<string, unknown>)
    const ports: Port[] = (target?.targetFields ?? []).map(field => ({
      name: field.name ?? '',
      dataType: targetDataType(field),
      direction: 'IN' as const,
    }))
    return { id, type: 'target', label: ABBR.target, name, x: 0, y: 0, ports, properties, file }
  }

  const transformation = findTransformation(mapping, folder, instance.transformationName)
  if (transformation) {
    collectScalarProps(properties, transformation as unknown as Record<string, unknown>)
    const typ = transformation.typ ?? instanceType ?? ''
    const kind = KIND[typ]
    const type: NodeType = kind ?? 'expression'
    const label = kind ? ABBR[kind] : fallbackLabel(typ)
    const ports: Port[] = (transformation.transformFields ?? []).map(field => {
      const fieldName = field.name ?? ''
      const expression = field.expression
      const port: Port = {
        name: fieldName,
        dataType: field.dataType ?? '',
        direction: portDirection(field.portType),
      }
      if (!isBlank(expression) && expression !== fieldName) port.expression = expression
      return port
    })
    return { id, type, label, name, x: 0, y: 0, ports, properties, file }
  }

  // Instance with no resolvable source/target/transformation — never throw.
  const typ = instanceType ?? ''
  const kind = KIND[typ]
  const type: NodeType = kind ?? 'expression'
  const label = kind ? ABBR[kind] : fallbackLabel(typ || 'UNKNOWN')
  return { id, type, label, name, x: 0, y: 0, ports: [], properties, file }
}
