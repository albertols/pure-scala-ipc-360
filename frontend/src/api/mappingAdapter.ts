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

// Layout constants (adapter-local; values mirror NodeBox geometry — header 44,
// port row 22, +10 pad; column pitch mirrors the mock's 230).
const X0 = 40, Y0 = 160, COL_PITCH = 230, V_GAP = 40
const HEADER_H = 44, PORT_H = 22, PAD = 10
const nodeHeight = (n: { ports: unknown[] }) => HEADER_H + n.ports.length * PORT_H + PAD

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

/** Unique-edge predecessor sets, keyed by node id (dedupes multi-field connectors). */
function buildPredecessors(nodes: ETLNode[], connections: Connection[]): Map<string, Set<string>> {
  const preds = new Map<string, Set<string>>()
  for (const n of nodes) preds.set(n.id, new Set())
  for (const c of connections) {
    if (c.fromNode === c.toNode) continue
    const set = preds.get(c.toNode)
    if (set) set.add(c.fromNode)
  }
  return preds
}

/**
 * Longest-path layering: layer 0 for nodes with no incoming connections or
 * kind 'source'; else 1 + max(layer(pred)). Memoized DFS with an in-progress
 * set — a back-edge into an in-progress (ancestor) node is a cycle, and is
 * treated as absent (skipped) rather than recursed into, so cycles can't hang.
 */
function computeLayers(nodes: ETLNode[], preds: Map<string, Set<string>>): Map<string, number> {
  const nodeById = new Map(nodes.map(n => [n.id, n]))
  const memo = new Map<string, number>()
  const inProgress = new Set<string>()

  function layer(id: string): number {
    const memoized = memo.get(id)
    if (memoized !== undefined) return memoized
    const node = nodeById.get(id)
    const predIds = preds.get(id) ?? new Set<string>()
    if (!node || node.type === 'source' || predIds.size === 0) {
      memo.set(id, 0)
      return 0
    }
    inProgress.add(id)
    let maxPredLayer = -1
    for (const p of predIds) {
      if (inProgress.has(p)) continue // back-edge (cycle): treat as absent
      maxPredLayer = Math.max(maxPredLayer, layer(p))
    }
    inProgress.delete(id)
    const result = maxPredLayer + 1 // all-preds-were-back-edges (-1) collapses to 0
    memo.set(id, result)
    return result
  }

  for (const n of nodes) layer(n.id)
  return memo
}

/**
 * Assigns final x/y (mutating nodes in place). Targets clamp to the max layer
 * (all targets share the final column). Within a column, nodes are ordered by
 * (average predecessor y, then name) and stacked top-down from Y0 using each
 * node's real height, so columns are processed left-to-right — predecessor
 * y's are always resolved before they're needed.
 */
function layoutNodes(nodes: ETLNode[], connections: Connection[]): void {
  if (nodes.length === 0) return
  const preds = buildPredecessors(nodes, connections)
  const rawLayers = computeLayers(nodes, preds)
  const maxLayer = Math.max(...nodes.map(n => rawLayers.get(n.id) ?? 0))

  const columns = new Map<number, ETLNode[]>()
  for (const n of nodes) {
    const l = n.type === 'target' ? maxLayer : (rawLayers.get(n.id) ?? 0)
    const arr = columns.get(l) ?? []
    arr.push(n)
    columns.set(l, arr)
  }

  const yById = new Map<string, number>()
  const avgPredY = (n: ETLNode): number => {
    const ys = [...(preds.get(n.id) ?? [])].map(p => yById.get(p)).filter((y): y is number => y !== undefined)
    if (ys.length === 0) return 0
    return ys.reduce((a, b) => a + b, 0) / ys.length
  }

  for (const l of [...columns.keys()].sort((a, b) => a - b)) {
    const col = columns.get(l)!
    col.sort((a, b) => avgPredY(a) - avgPredY(b) || a.name.localeCompare(b.name))
    let y = Y0
    for (const n of col) {
      n.x = X0 + l * COL_PITCH
      n.y = y
      yById.set(n.id, y)
      y += nodeHeight(n) + V_GAP
    }
  }
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

  layoutNodes(nodes, connections)

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
