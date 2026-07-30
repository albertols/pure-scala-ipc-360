// ─── Core ETL ────────────────────────────────────────────────────────────────

export type NodeType =
  | 'source' | 'sq' | 'expression' | 'lookup'
  | 'joiner' | 'aggregator' | 'router' | 'filter' | 'target'

export type TabId = 'viewer' | 'modifier' | 'operational' | 'dag'

export type StatusType = 'OK' | 'KO' | 'RUNNING' | 'PENDING'

export type DagStatus = 'success' | 'failed' | 'running' | 'skipped'

export interface Port {
  name: string
  dataType: string
  direction: 'IN' | 'OUT' | 'IN/OUT'
  linked?: boolean
  expression?: string
}

export interface ETLNode {
  id: string
  type: NodeType
  label: string
  name: string
  x: number
  y: number
  ports: Port[]
  properties: Record<string, string>
  file: string
}

export interface Connection {
  fromNode: string
  fromPort: string
  toNode: string
  toPort: string
}

// ─── Filesystem ───────────────────────────────────────────────────────────────

export interface FSFile {
  name: string
  path: string
  type: 'json' | 'xml'
  mapping?: string
  recipe?: string
}

export interface FSDir {
  name: string
  layer?: string
  children: (FSDir | FSFile)[]
}

// ─── ETL Modifier ─────────────────────────────────────────────────────────────

export interface RecipePort {
  name: string
  expression: string
  dataType?: string
}

export interface RecipeTransformation {
  id: string
  type: 'EXPRESSION' | 'LOOKUP' | 'AGGREGATOR' | 'JOINER' | 'ROUTER' | 'FILTER'
  name: string
  ports?: RecipePort[]
  group_by?: string[]
  lookup_table?: string
  lookup_condition?: string
  cache_type?: string
  join_type?: string
  join_condition?: string
  filter_condition?: string
}

export interface ETLRecipe {
  recipe_id: string
  layer: string
  bpm_id?: string
  source: {
    type: string
    schema: string
    table: string
    filter: string
    db_connection?: string
  }
  transformations: RecipeTransformation[]
  target: {
    type: string
    dataset: string
    table: string
    load_type: string
    partition_field: string
    cluster_fields?: string[]
  }
  metadata: {
    version: string
    owner: string
    last_modified: string
    description?: string
  }
}

export interface DDLColumn {
  name: string
  bq_type: string
  mode: 'NULLABLE' | 'REQUIRED' | 'REPEATED'
  description?: string
}

// ─── Operational ──────────────────────────────────────────────────────────────

export interface OperationalCard {
  id: string
  kind: 'table' | 'recipe'
  name: string
  layer: string
  status: StatusType
  lastRun: string
  history: StatusType[]
  stats: {
    avg_time_s: number
    p50: number
    p95: number
    p99: number
    avg_count: number
  }
  jobId?: string
  appId?: string
  relations: string[]
  x?: number
  y?: number
}

// ─── DAG ──────────────────────────────────────────────────────────────────────

export interface DagTask {
  task_id: string
  recipe_id: string
  depends_on: string[]
  last_status: DagStatus
  duration_s: number
  sub_dag?: DagCluster
  card_id?: string
  x?: number
  y?: number
}

export interface DagCluster {
  dag_id: string
  schedule: string
  last_run: string
  status: DagStatus
  tasks: DagTask[]
}

export interface DagRun {
  run_id: string
  dag_id: string
  status: DagStatus
  started_at: string
  duration_s: number
}
