# ETL 360 Suite — Full Implementation Plan

## Context

The current `App.tsx` is a single-screen ETL Viewer prototype with a hardcoded filesystem, two mock mappings, a panning SVG canvas, and a detail panel. The user wants to evolve this into a **multi-tab ETL 360 Suite** tightly integrated with GCP, with four active tabs and an architecture that anticipates future tabs (ETL Tuner, ETL Agents). The tabs are:

1. **ETL Viewer** — Informatica PowerCenter XML explorer + canvas (refine existing)
2. **ETL Modifier** — `_ETL_*.json` recipe editor with expression editing and save
3. **ETL Operational** — Table/recipe relationship graph with live BQ operational cards
4. **ETL DAG Orchestration** — Airflow DAG tree viewer with replay-to-Pub/Sub

---

## Architecture

### File Structure

```
src/
  App.tsx                  ← shell: top-level tabs + shared state only
  types.ts                 ← all shared TypeScript interfaces
  mockData.ts              ← all mock datasets (filesystem, mappings, ops, DAGs)
  components/
    shared/
      TopBar.tsx           ← app header, tab switcher, breadcrumb
      Sidebar.tsx          ← filesystem explorer (reused across Tab 1 & 2)
      NodeCanvas.tsx       ← pan/zoom SVG canvas (reused across Tab 1 & 2)
      OperationalCard.tsx  ← BQ state card (reused across Tab 3 & 4)
      GCPIcon.tsx          ← GCP service icon registry
      CopyButton.tsx       ← clipboard copy with toast feedback
      InfoTooltip.tsx      ← self-learning info icon + tooltip
      TimePicker.tsx       ← day/time/precision picker (Tab 3 & 4)
    tab1/
      ETLViewer.tsx        ← Tab 1 root
      NodeBox.tsx          ← SVG node (moved from App.tsx, enhanced)
      DetailPanel.tsx      ← node detail panel (moved + enhanced)
      PortTable.tsx        ← port table (moved from App.tsx)
    tab2/
      ETLModifier.tsx      ← Tab 2 root
      RecipeEditor.tsx     ← _ETL_*.json editor with field editing
      ExpressionList.tsx   ← collected EXP_ transformations list
      DDLViewer.tsx        ← DDL.json BigQuery column types panel
      SaveBar.tsx          ← sticky save/discard controls
    tab3/
      ETLOperational.tsx   ← Tab 3 root
      RelationshipGraph.tsx← D3-style zoom graph of table↔recipe edges
      OperationalCard.tsx  ← extended card with stats, history sparkline
      TimelineBar.tsx      ← operational time navigation bar
    tab4/
      ETLDag.tsx           ← Tab 4 root
      DagExplorer.tsx      ← collapsible DAG cluster tree sidebar
      DagCanvas.tsx        ← DAG flow canvas with replay controls
      ReplayPanel.tsx      ← Pub/Sub replay confirmation panel
  index.css                ← existing (add minor tokens)
```

### Shared State (App.tsx)

```typescript
const [activeTab, setActiveTab] = useState<'viewer'|'modifier'|'operational'|'dag'>('viewer')
const [selectedPath, setSelectedPath] = useState<string | null>(null)   // shared file selection
const [selectedMapping, setSelectedMapping] = useState<string>('m_order_fact')
```

---

## Tab 1: ETL Viewer (Refine Existing)

### Filesystem Explorer Changes

Update `FILESYSTEM` mock to reflect real naming patterns:
```
xmltobq/
  CDM/
    m_DM_DWHES_TABLA_COUNT_REPORT.xml
    m_DM_DWHES_CUSTOMER_PROFILE.xml
  ODS/
    BPM_74674_1/
      m_ODS_CRR_FLAG_AUDIT_LOG_BPM.xml
      m_ODS_CRR_TRANSACTION_DETAIL_BPM.xml
    BPM_83201_2/
      m_ODS_ACC_PAYMENT_RECONCILE_BPM.xml
  SRC/
    src_erp_orders.xml
    src_crm_customers.xml
  TGT/
    tgt_bq_order_fact.json
```

Top-level folders (CDM, ODS, SRC, TGT) get distinct color-coded left border in the sidebar.

### Informatica XML — Additional Fields to Surface in DetailPanel

The `properties` map per node should be expanded with Informatica-authentic fields:

| Node Type | Additional Fields |
|-----------|------------------|
| SRC | Business Name, Database Type, Owner Name, Filter Condition |
| SQ | SQL Query (full, syntax-highlighted), Number of SQL Queries, Distinct Output Rows |
| EXP | all port expressions (variable → formula), Tracing Level |
| LKP | Lookup Table, Lookup Condition, Return Policy, Dynamic/Persistent cache |
| JNR | Join Type, Master/Detail designation, Join Condition, Sorted Input |
| AGG | Group By Ports, all aggregate expressions per port, Sorted Input |
| RTR | all Groups + Filter Conditions per group |
| TGT | Target DB Type, Schema, Table, Insert/Update/Delete flags, Partition Key |

**Expression display**: in `DetailPanel`, EXP and AGG ports that have a formula get a code block (`<pre>`) with a `CopyButton` icon inline.

### Copy-to-Clipboard Targets

Add `CopyButton` next to: node name, SQL override, individual expressions, port names, data types, full property values.

---

## Tab 2: ETL Modifier

### File Layout Convention

```
xmltobq/CDM/m_DM_DWHES_TABLA_COUNT_REPORT/
  _ETL_m_DM_DWHES_TABLA_COUNT_REPORT.json   ← recipe
  _DDL_m_DM_DWHES_TABLA_COUNT_REPORT.json   ← BQ column schema

xmltobq/ODS/BPM_74674_1/m_ODS_CRR_FLAG_AUDIT_LOG_BPM/
  _ETL_m_ODS_CRR_FLAG_AUDIT_LOG_BPM.json
  _DDL_m_ODS_CRR_FLAG_AUDIT_LOG_BPM.json
```

### `_ETL_*.json` Schema (Mock)

```json
{
  "recipe_id": "m_ODS_CRR_FLAG_AUDIT_LOG_BPM",
  "layer": "ODS",
  "source": { "type": "Oracle", "schema": "CRR_SCHEMA", "table": "AUDIT_LOG", "filter": "" },
  "transformations": [
    { "id": "EXP_001", "type": "EXPRESSION", "name": "EXP_PARSE_FLAGS",
      "ports": [{ "name": "FLAG_RAW", "expression": "IIF(FLAG_VAL='Y',1,0)" }] },
    { "id": "LKP_001", "type": "LOOKUP", "name": "LKP_REF_CODES",
      "lookup_table": "REF_CODES", "condition": "CODE_ID = :IN_CODE" }
  ],
  "target": { "type": "BigQuery", "dataset": "ods_crr", "table": "FLAG_AUDIT_LOG",
               "load_type": "INSERT", "partition_field": "AUDIT_DATE" },
  "metadata": { "version": "1.3", "owner": "data-eng", "last_modified": "2025-11-14" }
}
```

### Layout

```
┌─────────────────┬───────────────────────────────────────────┐
│ File Explorer   │  Recipe Header (name, layer badge, owner) │
│ (same Sidebar)  ├─────────────┬─────────────────────────────┤
│                 │ Source Card │ Target Card (BQ)            │
│                 │ (editable)  │ (editable, DDL link)        │
│                 ├─────────────┴─────────────────────────────┤
│                 │ Transformations — horizontal scroll cards  │
│                 │ [EXP_001] [LKP_001] [AGG_001] … + Add     │
│                 ├───────────────────────────────────────────┤
│                 │ Expressions Collector                      │
│                 │ All EXP_ ports with formulas, editable     │
│                 ├───────────────────────────────────────────┤
│                 │ DDL Viewer — column list with BQ types     │
└─────────────────┴───────────────────────────────────────────┘
                   [Discard]                    [Save Changes]
```

- All text fields are inline-editable (`contentEditable` or `<input>`)
- `SaveBar` sticky at bottom: shows diff count ("3 unsaved changes"), Discard + Save buttons
- Expression formula fields use a `<textarea>` with monospace font + syntax hint
- `CopyButton` next to every expression formula, table name, SQL filter
- `DDLViewer` shows the `_DDL_*.json` schema as a table: Column | BQ Type | Mode | Description

---

## Tab 3: ETL Operational Table Relationships

### Data Model (Mock)

```typescript
interface OperationalCard {
  id: string
  kind: 'table' | 'recipe'
  name: string
  layer: string
  status: 'OK' | 'KO' | 'RUNNING' | 'PENDING'
  lastRun: string           // ISO timestamp
  history: ('OK'|'KO')[]   // last 20 runs
  stats: { avg_time_s: number; p50: number; p95: number; p99: number; avg_count: number }
  jobId?: string            // GCP Job ID → deep link
  appId?: string            // GCP App ID → deep link
  relations: string[]       // ids of connected cards
}
```

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Top: Search/filter bar + TimePicker bar (date+hour+precision) │
├──────────────────────────────────────────────────────────────┤
│ Main: Zoom-able relationship graph                            │
│  Cards float in a force-directed layout                      │
│  Edges = recipe → table provenance lines                     │
│  Zoom out → abstract cluster bubbles (CDM, ODS layers)       │
│  Zoom in  → full card with stats, history sparkline          │
│                                                              │
│  Card (zoomed in):                                           │
│  ┌──────────────────────────────────┐                        │
│  │ 🟢 OK  [GCP icon] TABLE_NAME     │                        │
│  │ Layer: ODS · Last: 14:32 UTC     │                        │
│  │ ████░░ History (20 runs)         │                        │
│  │ avg 4.2s · p95 12.1s · cnt 8.3k │                        │
│  │ [job_id →] [app_id →]            │                        │
│  └──────────────────────────────────┘                        │
└──────────────────────────────────────────────────────────────┘
```

### Key Features

- **Relationship graph**: CSS transform zoom + SVG edges; no D3 dependency needed (pure React + CSS)
- **Zoom abstraction**: below 0.5× scale, cards collapse to pill-shaped cluster nodes grouped by layer (CDM/ODS)
- **TimePicker**: date input + hour slider + precision selector (minute / hour / day); controls which historical snapshot of `history[]` is displayed; defaults to "now"
- **GCP status icons**: BigQuery icon on table cards, Dataflow/Spark icon on recipe cards
- **GCP deep links**: `job_id` → `https://console.cloud.google.com/dataproc/jobs/{job_id}`, `app_id` → GCP Logging filter URL (mocked as `#gcp-job/{id}` in prototype)
- **Card states**: green border+dot (OK), red (KO), amber pulse (RUNNING), gray (PENDING)
- **History sparkline**: 20-slot bar chart inline in card (each slot = one run, colored green/red)
- **InfoTooltip** on stats labels (avg, p50, p95) explaining what they mean

---

## Tab 4: ETL DAG Orchestration

### Data Model (Mock)

```typescript
interface DagCluster {
  dag_id: string
  schedule: string
  last_run: string
  status: 'success' | 'failed' | 'running'
  tasks: DagTask[]
}

interface DagTask {
  task_id: string
  recipe_id: string          // links to _ETL_*.json
  depends_on: string[]       // task_ids
  sub_dag?: DagCluster       // nested sub-DAG
  last_status: 'success' | 'failed' | 'running' | 'skipped'
  duration_s: number
  card?: OperationalCard     // reuse Tab 3 card data
}
```

### Layout

```
┌──────────────────┬────────────────────────────────────────────┐
│ DAG Explorer     │ DAG Canvas (pan/zoom, same as Tab 1)        │
│                  │                                            │
│ ▶ DAG_CDM_DAILY  │  [task_1] ──→ [task_2] ──→ [task_4]        │
│   ▶ task_1       │                    ↘                       │
│     task_2       │               [sub_dag_1]                  │
│     sub_dag_1    │                    ↓                       │
│       task_3a    │               [task_3a] [task_3b]          │
│       task_3b    │                                            │
│   ▶ DAG_ODS_BPM  ├────────────────────────────────────────────┤
│     task_1       │ Selected Task Detail + OperationalCard      │
│     task_2       │ [Replay Branch ▶] [Replay from here ▶]     │
│                  │ → sends msg to GCP Pub/Sub topic (mocked)  │
└──────────────────┴────────────────────────────────────────────┘
```

### Key Features

- **DAG Explorer sidebar**: collapsible tree, each task shows last_status dot
- **DAG Canvas**: directed graph, tasks as nodes, dependency arrows as edges; reuses `NodeCanvas.tsx` pan/zoom
- **Task nodes**: show recipe_id, duration, last_status color; click → bottom detail panel
- **OperationalCard reuse**: task detail shows the same card component from Tab 3
- **Replay controls**: "Replay Branch" and "Replay from here" buttons → mock `POST /pubsub/replay` with `{ dag_id, task_id, from_task }` payload; show confirmation modal
- **Execution history**: below selected task, last 10 runs as a timeline row (green/red/amber boxes + timestamp on hover)
- **TimePicker**: reused from Tab 3, filters history view

---

## Shared Components

### `CopyButton.tsx`
```typescript
// inline icon button; on click: navigator.clipboard.writeText(value)
// shows a transient ✓ checkmark for 1.5s then reverts
```

### `GCPIcon.tsx`
```typescript
// registry of SVG icons: BigQuery, Dataflow, Pub/Sub, Cloud Logging, Airflow
// usage: <GCPIcon service="bigquery" size={16} />
// uses inline SVG paths matching GCP brand colors
```

### `InfoTooltip.tsx`
```typescript
// small ⓘ icon; on hover shows a tooltip with explanatory text
// usage: <InfoTooltip text="p95 = 95th percentile of execution time across all runs" />
```

### `TimePicker.tsx`
```typescript
// date input + hour range slider + precision select (min/hr/day)
// emits: { date: string, hour: number, precision: 'minute'|'hour'|'day' }
// "Now" shortcut button resets to current time
```

### `OperationalCard.tsx`
```typescript
// reusable across Tab 3 and Tab 4
// props: card: OperationalCard, compact?: boolean, onClick?: fn
// compact=true → pill view for zoom-out cluster
// compact=false → full card with history sparkline + stats + GCP links
```

---

## Global Navigation (TopBar)

Replace the current mapping-tab strip with a full tab bar:

```
┌──────────────────────────────────────────────────────────────────┐
│ [xmltobq logo] │ ETL Viewer │ ETL Modifier │ ETL Operational │ ETL DAG │ ··· │
│                │                            breadcrumb + search   │ ⚙ info │
└──────────────────────────────────────────────────────────────────┘
```

- `···` placeholder for future tabs (ETL Tuner, ETL Agents) shown as disabled/dimmed
- `ⓘ` opens a "suite info" tooltip listing what each tab does
- Active tab has colored underline matching the tab's accent color

---

## Mock Data Plan (`mockData.ts`)

| Export | Content |
|--------|---------|
| `FILESYSTEM` | xmltobq/CDM/*, xmltobq/ODS/BPM_74674_1/*, xmltobq/ODS/BPM_83201_2/* |
| `MAPPINGS` | m_order_fact (8 nodes), m_customer_dim (4 nodes), m_DM_DWHES_TABLA_COUNT_REPORT (5 nodes) |
| `ETL_RECIPES` | 4× `_ETL_*.json` objects covering CDM and ODS layers |
| `DDL_SCHEMAS` | 4× `_DDL_*.json` with BQ column types |
| `OPERATIONAL_CARDS` | 12 cards (mix of tables and recipes), OK/KO/RUNNING states |
| `DAG_CLUSTERS` | 2 DAG clusters with nested sub-DAGs and task dependencies |

---

## Implementation Order

1. **Scaffold**: extract shared types to `types.ts`, mock data to `mockData.ts`, add global tab nav to `App.tsx`
2. **Shared components**: `CopyButton`, `GCPIcon`, `InfoTooltip`, `OperationalCard`, `TimePicker`
3. **Tab 1 (ETL Viewer)**: move existing components to `tab1/`, update filesystem mock, expand `DetailPanel` with expressions + copy buttons
4. **Tab 2 (ETL Modifier)**: build `RecipeEditor`, `ExpressionList`, `DDLViewer`, `SaveBar`
5. **Tab 3 (ETL Operational)**: build `RelationshipGraph`, zoom abstraction, time navigation
6. **Tab 4 (ETL DAG)**: build `DagExplorer`, `DagCanvas`, `ReplayPanel`, reuse `OperationalCard`

---

## Verification

- Dev server (always running on `$PORT`) auto-reloads on save — visually verify each tab renders without errors
- Tab switching: all 4 tabs navigate cleanly, no blank screens
- Tab 1: click node → detail panel; copy button copies to clipboard; filesystem tree collapses/expands
- Tab 2: edit an expression field → save bar shows "1 unsaved change" → Save resets counter
- Tab 3: zoom slider transitions cards to cluster pills; clicking a card highlights its edges
- Tab 4: expand a sub-DAG in explorer → canvas updates; Replay button shows confirmation modal
- TypeScript: `pnpm build` (or `vite build`) completes with no type errors
