// LEGACY FIGMA MOCK DATA — being retired tab-by-tab per docs/superpowers/specs/2026-07-29-etl360-foundation-design.md.
// ALL FOUR TABS ARE REAL NOW — the filesystem tree, Tab-1 Viewer, Tab-2 Modifier,
// Tab-3 Operational and Tab-4 DAG all consume the live backend. MAPPINGS,
// ETL_RECIPES/DDL_SCHEMAS and DAG_CLUSTERS/DAG_RUNS were retired with their
// sub-projects; OPERATIONAL_CARDS below now has ZERO importers (Tab 3 and Tab 4 both
// left it at the four-stream merge) and is retire-on-sight for the next task that
// touches this file.
import type {
  FSDir,
  OperationalCard, StatusType
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
