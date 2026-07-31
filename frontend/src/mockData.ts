// LEGACY FIGMA MOCK DATA — being retired tab-by-tab per docs/superpowers/specs/2026-07-29-etl360-foundation-design.md.
// The filesystem tree, the Tab-1 Viewer canvas AND the Tab-4 DAG are REAL now; remaining tabs below still consume mocks until their sub-project lands.
import type {
  FSDir, ETLRecipe, DDLColumn,
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

// ─── ETL Recipes ──────────────────────────────────────────────────────────────

export const ETL_RECIPES: Record<string, ETLRecipe> = {
  etl_cdm_count_report: {
    recipe_id: 'm_DM_DWHES_TABLA_COUNT_REPORT',
    layer: 'CDM',
    source: { type: 'Oracle', schema: 'DWHES_SCHEMA', table: 'TABLA_METADATA', filter: "STATUS = 'ACTIVE'", db_connection: 'CONN_ERP_PROD' },
    transformations: [
      {
        id: 'EXP_001', type: 'EXPRESSION', name: 'EXP_FORMAT_REPORT',
        ports: [
          { name: 'REPORT_KEY', expression: "MD5(TABLA_ID || '_' || TO_CHAR(LOAD_DATE,'YYYYMMDD'))", dataType: 'VARCHAR2(32)' },
          { name: 'ROW_COUNT_FMT', expression: "TO_CHAR(ROW_COUNT,'999,999,999')", dataType: 'VARCHAR2(20)' },
          { name: 'LOAD_DT_STR', expression: "TO_CHAR(LOAD_DATE,'YYYY-MM-DD')", dataType: 'VARCHAR2(10)' },
          { name: 'COUNT_BAND', expression: "IIF(ROW_COUNT>1000000,'LARGE',IIF(ROW_COUNT>100000,'MEDIUM','SMALL'))", dataType: 'VARCHAR2(10)' },
        ],
      },
      {
        id: 'AGG_001', type: 'AGGREGATOR', name: 'AGG_DAILY_COUNTS',
        group_by: ['LOAD_DT_STR', 'COUNT_BAND'],
        ports: [
          { name: 'TABLE_CNT', expression: 'COUNT(REPORT_KEY)', dataType: 'NUMBER(10)' },
          { name: 'TOTAL_ROWS', expression: 'SUM(ROW_COUNT)', dataType: 'NUMBER(18)' },
        ],
      },
    ],
    target: { type: 'BigQuery', dataset: 'cdm_dwhes', table: 'TABLA_COUNT_REPORT', load_type: 'INSERT', partition_field: 'LOAD_DT_STR', cluster_fields: ['COUNT_BAND'] },
    metadata: { version: '1.4', owner: 'data-eng-cdm', last_modified: '2025-10-22', description: 'Daily table row count report aggregated by band' },
  },

  etl_cdm_customer_profile: {
    recipe_id: 'm_DM_DWHES_CUSTOMER_PROFILE',
    layer: 'CDM',
    source: { type: 'PostgreSQL', schema: 'crm_public', table: 'CUSTOMER_MASTER', filter: 'ACTIVE = TRUE AND GDPR_CONSENT = TRUE', db_connection: 'CONN_CRM_PROD' },
    transformations: [
      {
        id: 'EXP_001', type: 'EXPRESSION', name: 'EXP_NORMALIZE_CUSTOMER',
        ports: [
          { name: 'CUST_KEY', expression: "MD5(TO_CHAR(CUST_ID))", dataType: 'VARCHAR2(32)' },
          { name: 'CUST_NAME_CLEAN', expression: "INITCAP(LTRIM(RTRIM(FULL_NAME)))", dataType: 'VARCHAR2(200)' },
          { name: 'SEGMENT_GROUP', expression: "IIF(INSTR(SEGMENT,'VIP')>0,'PREMIUM',IIF(INSTR(SEGMENT,'SMB')>0,'SMB','STANDARD'))", dataType: 'VARCHAR2(20)' },
        ],
      },
    ],
    target: { type: 'BigQuery', dataset: 'cdm_dwhes', table: 'CUSTOMER_DIM', load_type: 'UPSERT', partition_field: '', cluster_fields: ['SEGMENT_GROUP'] },
    metadata: { version: '2.1', owner: 'data-eng-cdm', last_modified: '2025-11-05', description: 'Customer dimension with GDPR-filtered and normalized profiles' },
  },

  etl_ods_flag_audit: {
    recipe_id: 'm_ODS_CRR_FLAG_AUDIT_LOG_BPM',
    layer: 'ODS',
    bpm_id: 'BPM_74674_1',
    source: { type: 'Oracle', schema: 'CRR_SCHEMA', table: 'AUDIT_LOG', filter: "LOG_TYPE = 'FLAG' AND PROC_DATE >= SYSDATE - 1", db_connection: 'CONN_CRR_PROD' },
    transformations: [
      {
        id: 'EXP_001', type: 'EXPRESSION', name: 'EXP_PARSE_FLAGS',
        ports: [
          { name: 'FLAG_BIT', expression: "IIF(FLAG_VAL='Y',1,0)", dataType: 'NUMBER(1)' },
          { name: 'AUDIT_KEY', expression: "LOG_ID || '_' || TO_CHAR(PROC_DATE,'YYYYMMDD')", dataType: 'VARCHAR2(50)' },
          { name: 'PROC_DT_STR', expression: "TO_CHAR(PROC_DATE,'YYYY-MM-DD')", dataType: 'VARCHAR2(10)' },
        ],
      },
      {
        id: 'LKP_001', type: 'LOOKUP', name: 'LKP_FLAG_CODES',
        lookup_table: 'REF_FLAG_CODES',
        lookup_condition: 'FLAG_CODE = :IN_FLAG_CODE',
        cache_type: 'Persistent',
      },
      {
        id: 'FLT_001', type: 'FILTER', name: 'FLT_VALID_FLAGS',
        filter_condition: "FLAG_BIT = 1 AND LKP_FLAG_DESC IS NOT NULL",
      },
    ],
    target: { type: 'BigQuery', dataset: 'ods_crr', table: 'FLAG_AUDIT_LOG', load_type: 'INSERT', partition_field: 'PROC_DT_STR', cluster_fields: [] },
    metadata: { version: '1.1', owner: 'data-eng-ods', last_modified: '2025-11-14', description: 'BPM 74674: Flag audit log ingestion with reference lookup' },
  },

  etl_ods_payment_reconcile: {
    recipe_id: 'm_ODS_ACC_PAYMENT_RECONCILE_BPM',
    layer: 'ODS',
    bpm_id: 'BPM_83201_2',
    source: { type: 'Oracle', schema: 'ACC_SCHEMA', table: 'PAYMENT_TXN', filter: "TXN_STATUS IN ('SETTLED','REVERSED')", db_connection: 'CONN_ACC_PROD' },
    transformations: [
      {
        id: 'EXP_001', type: 'EXPRESSION', name: 'EXP_RECONCILE_AMT',
        ports: [
          { name: 'NET_AMT', expression: 'IIF(TXN_STATUS=\'REVERSED\', TXN_AMT * -1, TXN_AMT)', dataType: 'NUMBER(18,2)' },
          { name: 'SETTLE_DT_STR', expression: "TO_CHAR(SETTLE_DATE,'YYYY-MM-DD')", dataType: 'VARCHAR2(10)' },
          { name: 'RECON_KEY', expression: "TXN_ID || '_' || ACCOUNT_ID", dataType: 'VARCHAR2(60)' },
        ],
      },
      {
        id: 'JNR_001', type: 'JOINER', name: 'JNR_ACCOUNT_PAYMENT',
        join_type: 'Left Outer',
        join_condition: 'EXP_RECONCILE_AMT.ACCOUNT_ID = SQ_ACCOUNT_MASTER.ACC_ID',
      },
      {
        id: 'AGG_001', type: 'AGGREGATOR', name: 'AGG_DAILY_RECON',
        group_by: ['SETTLE_DT_STR', 'ACCOUNT_ID'],
        ports: [
          { name: 'TOTAL_NET_AMT', expression: 'SUM(NET_AMT)', dataType: 'NUMBER(18,2)' },
          { name: 'TXN_COUNT', expression: 'COUNT(RECON_KEY)', dataType: 'NUMBER(10)' },
        ],
      },
    ],
    target: { type: 'BigQuery', dataset: 'ods_acc', table: 'PAYMENT_RECONCILE', load_type: 'INSERT', partition_field: 'SETTLE_DT_STR', cluster_fields: ['ACCOUNT_ID'] },
    metadata: { version: '3.0', owner: 'data-eng-ods', last_modified: '2025-12-01', description: 'BPM 83201: Daily payment reconciliation with account join' },
  },
}

// ─── DDL Schemas ─────────────────────────────────────────────────────────────

export const DDL_SCHEMAS: Record<string, DDLColumn[]> = {
  etl_cdm_count_report: [
    { name: 'LOAD_DT_STR', bq_type: 'STRING', mode: 'REQUIRED', description: 'Partition date key YYYY-MM-DD' },
    { name: 'COUNT_BAND', bq_type: 'STRING', mode: 'REQUIRED', description: 'Row count classification: SMALL / MEDIUM / LARGE' },
    { name: 'TABLE_CNT', bq_type: 'INT64', mode: 'NULLABLE', description: 'Number of tables in this band on this date' },
    { name: 'TOTAL_ROWS', bq_type: 'INT64', mode: 'NULLABLE', description: 'Sum of row counts across all tables in band' },
    { name: '_INSERTED_AT', bq_type: 'TIMESTAMP', mode: 'REQUIRED', description: 'Record insertion timestamp (UTC)' },
    { name: '_JOB_ID', bq_type: 'STRING', mode: 'NULLABLE', description: 'Dataproc/Spark job ID that wrote this record' },
  ],
  etl_cdm_customer_profile: [
    { name: 'CUST_KEY', bq_type: 'STRING', mode: 'REQUIRED', description: 'MD5 surrogate key from CUST_ID' },
    { name: 'CUST_NAME_CLEAN', bq_type: 'STRING', mode: 'NULLABLE', description: 'Normalized customer full name' },
    { name: 'SEGMENT_GROUP', bq_type: 'STRING', mode: 'NULLABLE', description: 'Derived segment: PREMIUM / SMB / STANDARD' },
    { name: '_EFFECTIVE_FROM', bq_type: 'DATE', mode: 'REQUIRED', description: 'SCD effective date start' },
    { name: '_EFFECTIVE_TO', bq_type: 'DATE', mode: 'NULLABLE', description: 'SCD effective date end (NULL = current)' },
    { name: '_IS_CURRENT', bq_type: 'BOOL', mode: 'REQUIRED', description: 'TRUE if this is the current active record' },
  ],
  etl_ods_flag_audit: [
    { name: 'AUDIT_KEY', bq_type: 'STRING', mode: 'REQUIRED', description: 'Composite key LOG_ID + PROC_DATE' },
    { name: 'LOG_ID', bq_type: 'INT64', mode: 'REQUIRED', description: 'Source audit log ID' },
    { name: 'FLAG_BIT', bq_type: 'INT64', mode: 'NULLABLE', description: '1=flagged 0=cleared' },
    { name: 'FLAG_CODE', bq_type: 'STRING', mode: 'NULLABLE', description: 'Flag type code from source' },
    { name: 'FLAG_DESC', bq_type: 'STRING', mode: 'NULLABLE', description: 'Lookup description from REF_FLAG_CODES' },
    { name: 'PROC_DT_STR', bq_type: 'STRING', mode: 'REQUIRED', description: 'Processing date partition key' },
    { name: '_INSERTED_AT', bq_type: 'TIMESTAMP', mode: 'REQUIRED', description: 'BQ insertion timestamp' },
  ],
  etl_ods_payment_reconcile: [
    { name: 'SETTLE_DT_STR', bq_type: 'STRING', mode: 'REQUIRED', description: 'Settlement date YYYY-MM-DD' },
    { name: 'ACCOUNT_ID', bq_type: 'STRING', mode: 'REQUIRED', description: 'Account identifier' },
    { name: 'TOTAL_NET_AMT', bq_type: 'NUMERIC', mode: 'NULLABLE', description: 'Net daily settled amount (reversals subtracted)' },
    { name: 'TXN_COUNT', bq_type: 'INT64', mode: 'NULLABLE', description: 'Number of transactions in reconciliation' },
    { name: 'ACC_NAME', bq_type: 'STRING', mode: 'NULLABLE', description: 'Account name from master join' },
    { name: '_INSERTED_AT', bq_type: 'TIMESTAMP', mode: 'REQUIRED', description: 'BQ insertion timestamp' },
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
