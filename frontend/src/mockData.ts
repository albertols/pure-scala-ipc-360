// LEGACY FIGMA MOCK DATA — being retired tab-by-tab per docs/superpowers/specs/2026-07-29-etl360-foundation-design.md.
// The filesystem tree, the Tab-1 Viewer canvas AND the Tab-2 Modifier canvas/recipe/DDL
// data are REAL now (ETL_RECIPES/DDL_SCHEMAS retired — see docs/superpowers/plans/2026-07-31-etl-modifier.md
// Task 6); remaining tabs below still consume mocks until their sub-project lands.
import type {
  FSDir,
  OperationalCard, DagCluster, StatusType
} from './types'

// ─── Filesystem ───────────────────────────────────────────────────────────────

export const FILESYSTEM: FSDir = {
  name: 'xmltobq',
  layer: 'root',
  children: [
    {
      name: 'CDM',
      layer: 'CDM',
      children: [
        { name: 'm_DM_DWHES_TABLA_COUNT_REPORT.xml', path: 'xmltobq/CDM/m_DM_DWHES_TABLA_COUNT_REPORT.xml', type: 'xml', mapping: 'm_DM_DWHES_TABLA_COUNT_REPORT' },
        { name: 'm_DM_DWHES_CUSTOMER_PROFILE.xml', path: 'xmltobq/CDM/m_DM_DWHES_CUSTOMER_PROFILE.xml', type: 'xml', mapping: 'm_customer_dim' },
        { name: 'm_DM_DWHES_PRODUCT_CATALOG.xml', path: 'xmltobq/CDM/m_DM_DWHES_PRODUCT_CATALOG.xml', type: 'xml', mapping: 'm_order_fact' },
        {
          name: 'm_DM_DWHES_TABLA_COUNT_REPORT',
          children: [
            { name: '_ETL_m_DM_DWHES_TABLA_COUNT_REPORT.json', path: 'xmltobq/CDM/m_DM_DWHES_TABLA_COUNT_REPORT/_ETL_m_DM_DWHES_TABLA_COUNT_REPORT.json', type: 'json', recipe: 'etl_cdm_count_report' },
            { name: '_DDL_m_DM_DWHES_TABLA_COUNT_REPORT.json', path: 'xmltobq/CDM/m_DM_DWHES_TABLA_COUNT_REPORT/_DDL_m_DM_DWHES_TABLA_COUNT_REPORT.json', type: 'json' },
          ],
        },
        {
          name: 'm_DM_DWHES_CUSTOMER_PROFILE',
          children: [
            { name: '_ETL_m_DM_DWHES_CUSTOMER_PROFILE.json', path: 'xmltobq/CDM/m_DM_DWHES_CUSTOMER_PROFILE/_ETL_m_DM_DWHES_CUSTOMER_PROFILE.json', type: 'json', recipe: 'etl_cdm_customer_profile' },
            { name: '_DDL_m_DM_DWHES_CUSTOMER_PROFILE.json', path: 'xmltobq/CDM/m_DM_DWHES_CUSTOMER_PROFILE/_DDL_m_DM_DWHES_CUSTOMER_PROFILE.json', type: 'json' },
          ],
        },
      ],
    },
    {
      name: 'ODS',
      layer: 'ODS',
      children: [
        {
          name: 'BPM_74674_1',
          children: [
            { name: 'm_ODS_CRR_FLAG_AUDIT_LOG_BPM.xml', path: 'xmltobq/ODS/BPM_74674_1/m_ODS_CRR_FLAG_AUDIT_LOG_BPM.xml', type: 'xml', mapping: 'm_order_fact' },
            { name: 'm_ODS_CRR_TRANSACTION_DETAIL_BPM.xml', path: 'xmltobq/ODS/BPM_74674_1/m_ODS_CRR_TRANSACTION_DETAIL_BPM.xml', type: 'xml', mapping: 'm_customer_dim' },
            {
              name: 'm_ODS_CRR_FLAG_AUDIT_LOG_BPM',
              children: [
                { name: '_ETL_m_ODS_CRR_FLAG_AUDIT_LOG_BPM.json', path: 'xmltobq/ODS/BPM_74674_1/m_ODS_CRR_FLAG_AUDIT_LOG_BPM/_ETL_m_ODS_CRR_FLAG_AUDIT_LOG_BPM.json', type: 'json', recipe: 'etl_ods_flag_audit' },
                { name: '_DDL_m_ODS_CRR_FLAG_AUDIT_LOG_BPM.json', path: 'xmltobq/ODS/BPM_74674_1/m_ODS_CRR_FLAG_AUDIT_LOG_BPM/_DDL_m_ODS_CRR_FLAG_AUDIT_LOG_BPM.json', type: 'json' },
              ],
            },
          ],
        },
        {
          name: 'BPM_83201_2',
          children: [
            { name: 'm_ODS_ACC_PAYMENT_RECONCILE_BPM.xml', path: 'xmltobq/ODS/BPM_83201_2/m_ODS_ACC_PAYMENT_RECONCILE_BPM.xml', type: 'xml', mapping: 'm_customer_dim' },
            {
              name: 'm_ODS_ACC_PAYMENT_RECONCILE_BPM',
              children: [
                { name: '_ETL_m_ODS_ACC_PAYMENT_RECONCILE_BPM.json', path: 'xmltobq/ODS/BPM_83201_2/m_ODS_ACC_PAYMENT_RECONCILE_BPM/_ETL_m_ODS_ACC_PAYMENT_RECONCILE_BPM.json', type: 'json', recipe: 'etl_ods_payment_reconcile' },
                { name: '_DDL_m_ODS_ACC_PAYMENT_RECONCILE_BPM.json', path: 'xmltobq/ODS/BPM_83201_2/m_ODS_ACC_PAYMENT_RECONCILE_BPM/_DDL_m_ODS_ACC_PAYMENT_RECONCILE_BPM.json', type: 'json' },
              ],
            },
          ],
        },
      ],
    },
  ],
}

// ─── Operational Cards ────────────────────────────────────────────────────────

function mkHistory(okRate: number): StatusType[] {
  return Array.from({ length: 20 }, () => Math.random() < okRate ? 'OK' : 'KO') as StatusType[]
}

export const OPERATIONAL_CARDS: OperationalCard[] = [
  {
    id: 'rec_cdm_count', kind: 'recipe', name: 'm_DM_DWHES_TABLA_COUNT_REPORT', layer: 'CDM',
    status: 'OK', lastRun: '2025-12-10T06:15:00Z', history: mkHistory(0.9),
    stats: { avg_time_s: 142, p50: 138, p95: 210, p99: 285, avg_count: 12450 },
    jobId: 'job-cdm-count-20251210-0001', appId: 'app-spark-cdm-001',
    relations: ['tbl_cdm_count', 'rec_cdm_customer'],
    x: 120, y: 100,
  },
  {
    id: 'tbl_cdm_count', kind: 'table', name: 'cdm_dwhes.TABLA_COUNT_REPORT', layer: 'CDM',
    status: 'OK', lastRun: '2025-12-10T06:22:00Z', history: mkHistory(0.88),
    stats: { avg_time_s: 0, p50: 0, p95: 0, p99: 0, avg_count: 94830 },
    jobId: undefined, appId: undefined,
    relations: ['rec_cdm_count'],
    x: 400, y: 80,
  },
  {
    id: 'rec_cdm_customer', kind: 'recipe', name: 'm_DM_DWHES_CUSTOMER_PROFILE', layer: 'CDM',
    status: 'OK', lastRun: '2025-12-10T07:01:00Z', history: mkHistory(0.95),
    stats: { avg_time_s: 87, p50: 82, p95: 143, p99: 198, avg_count: 892440 },
    jobId: 'job-cdm-cust-20251210-0001', appId: 'app-spark-cdm-002',
    relations: ['tbl_cdm_customer', 'rec_cdm_count'],
    x: 120, y: 300,
  },
  {
    id: 'tbl_cdm_customer', kind: 'table', name: 'cdm_dwhes.CUSTOMER_DIM', layer: 'CDM',
    status: 'OK', lastRun: '2025-12-10T07:14:00Z', history: mkHistory(0.93),
    stats: { avg_time_s: 0, p50: 0, p95: 0, p99: 0, avg_count: 892440 },
    relations: ['rec_cdm_customer', 'rec_ods_flag'],
    x: 400, y: 280,
  },
  {
    id: 'rec_ods_flag', kind: 'recipe', name: 'm_ODS_CRR_FLAG_AUDIT_LOG_BPM', layer: 'ODS',
    status: 'KO', lastRun: '2025-12-10T05:45:00Z', history: mkHistory(0.7),
    stats: { avg_time_s: 54, p50: 49, p95: 112, p99: 230, avg_count: 38291 },
    jobId: 'job-ods-flag-20251210-0001', appId: 'app-spark-ods-003',
    relations: ['tbl_ods_flag', 'tbl_cdm_customer'],
    x: 680, y: 180,
  },
  {
    id: 'tbl_ods_flag', kind: 'table', name: 'ods_crr.FLAG_AUDIT_LOG', layer: 'ODS',
    status: 'KO', lastRun: '2025-12-10T05:52:00Z', history: mkHistory(0.72),
    stats: { avg_time_s: 0, p50: 0, p95: 0, p99: 0, avg_count: 0 },
    relations: ['rec_ods_flag', 'rec_ods_payment'],
    x: 920, y: 140,
  },
  {
    id: 'rec_ods_payment', kind: 'recipe', name: 'm_ODS_ACC_PAYMENT_RECONCILE_BPM', layer: 'ODS',
    status: 'RUNNING', lastRun: '2025-12-10T08:00:00Z', history: mkHistory(0.85),
    stats: { avg_time_s: 310, p50: 290, p95: 480, p99: 620, avg_count: 2100000 },
    jobId: 'job-ods-pay-20251210-0001', appId: 'app-spark-ods-004',
    relations: ['tbl_ods_payment', 'tbl_ods_flag'],
    x: 680, y: 380,
  },
  {
    id: 'tbl_ods_payment', kind: 'table', name: 'ods_acc.PAYMENT_RECONCILE', layer: 'ODS',
    status: 'RUNNING', lastRun: '2025-12-10T08:00:00Z', history: mkHistory(0.83),
    stats: { avg_time_s: 0, p50: 0, p95: 0, p99: 0, avg_count: 0 },
    relations: ['rec_ods_payment'],
    x: 920, y: 360,
  },
]

// ─── DAG Clusters ─────────────────────────────────────────────────────────────

export const DAG_CLUSTERS: DagCluster[] = [
  {
    dag_id: 'DAG_CDM_DAILY',
    schedule: '0 5 * * *',
    last_run: '2025-12-10T05:00:00Z',
    status: 'success',
    tasks: [
      { task_id: 'wait_source_ready', recipe_id: 'sensor', depends_on: [], last_status: 'success', duration_s: 12, x: 60, y: 80 },
      { task_id: 'run_cdm_count_report', recipe_id: 'etl_cdm_count_report', depends_on: ['wait_source_ready'], last_status: 'success', duration_s: 142, card_id: 'rec_cdm_count', x: 280, y: 80 },
      { task_id: 'run_cdm_customer', recipe_id: 'etl_cdm_customer_profile', depends_on: ['wait_source_ready'], last_status: 'success', duration_s: 87, card_id: 'rec_cdm_customer', x: 280, y: 200 },
      {
        task_id: 'sub_dag_cdm_validate', recipe_id: 'sub_dag', depends_on: ['run_cdm_count_report', 'run_cdm_customer'], last_status: 'success', duration_s: 34, x: 520, y: 140,
        sub_dag: {
          dag_id: 'SUB_DAG_CDM_VALIDATE',
          schedule: '',
          last_run: '2025-12-10T06:25:00Z',
          status: 'success',
          tasks: [
            { task_id: 'validate_row_counts', recipe_id: 'validator', depends_on: [], last_status: 'success', duration_s: 18, x: 60, y: 80 },
            { task_id: 'validate_bq_schema', recipe_id: 'validator', depends_on: ['validate_row_counts'], last_status: 'success', duration_s: 16, x: 280, y: 80 },
          ],
        },
      },
      { task_id: 'notify_success', recipe_id: 'notifier', depends_on: ['sub_dag_cdm_validate'], last_status: 'success', duration_s: 2, x: 740, y: 140 },
    ],
  },
  {
    dag_id: 'DAG_ODS_BPM_74674',
    schedule: '30 4 * * *',
    last_run: '2025-12-10T04:30:00Z',
    status: 'failed',
    tasks: [
      { task_id: 'wait_crr_extract', recipe_id: 'sensor', depends_on: [], last_status: 'success', duration_s: 8, x: 60, y: 80 },
      { task_id: 'run_ods_flag_audit', recipe_id: 'etl_ods_flag_audit', depends_on: ['wait_crr_extract'], last_status: 'failed', duration_s: 54, card_id: 'rec_ods_flag', x: 280, y: 80 },
      { task_id: 'run_ods_payment', recipe_id: 'etl_ods_payment_reconcile', depends_on: ['run_ods_flag_audit'], last_status: 'skipped', duration_s: 0, card_id: 'rec_ods_payment', x: 520, y: 80 },
      { task_id: 'notify_failure', recipe_id: 'notifier', depends_on: ['run_ods_flag_audit'], last_status: 'success', duration_s: 2, x: 520, y: 200 },
    ],
  },
]

export const DAG_RUNS: Record<string, { run_id: string; status: string; started_at: string; duration_s: number }[]> = {
  DAG_CDM_DAILY: [
    { run_id: 'run-2025-12-10-0500', status: 'success', started_at: '2025-12-10T05:00:00Z', duration_s: 280 },
    { run_id: 'run-2025-12-09-0500', status: 'success', started_at: '2025-12-09T05:00:00Z', duration_s: 262 },
    { run_id: 'run-2025-12-08-0500', status: 'success', started_at: '2025-12-08T05:00:00Z', duration_s: 301 },
    { run_id: 'run-2025-12-07-0500', status: 'failed', started_at: '2025-12-07T05:00:00Z', duration_s: 89 },
    { run_id: 'run-2025-12-06-0500', status: 'success', started_at: '2025-12-06T05:00:00Z', duration_s: 258 },
  ],
  DAG_ODS_BPM_74674: [
    { run_id: 'run-2025-12-10-0430', status: 'failed', started_at: '2025-12-10T04:30:00Z', duration_s: 64 },
    { run_id: 'run-2025-12-09-0430', status: 'success', started_at: '2025-12-09T04:30:00Z', duration_s: 198 },
    { run_id: 'run-2025-12-08-0430', status: 'success', started_at: '2025-12-08T04:30:00Z', duration_s: 205 },
    { run_id: 'run-2025-12-07-0430', status: 'success', started_at: '2025-12-07T04:30:00Z', duration_s: 191 },
  ],
}
