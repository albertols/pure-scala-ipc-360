// LEGACY FIGMA MOCK DATA — being retired tab-by-tab per docs/superpowers/specs/2026-07-29-etl360-foundation-design.md.
// The filesystem tree is REAL now (src/api/filesystemAdapter.ts); tabs below still consume mocks until their sub-project lands.
import type {
  FSDir, ETLNode, Connection, ETLRecipe, DDLColumn,
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

// ─── ETL Mappings (for Viewer) ────────────────────────────────────────────────

export const MAPPINGS: Record<string, { nodes: ETLNode[]; connections: Connection[] }> = {
  m_DM_DWHES_TABLA_COUNT_REPORT: {
    nodes: [
      {
        id: 'src1', type: 'source', label: 'SRC', name: 'SRC_DWHES_TABLA_META',
        x: 40, y: 180, file: 'm_DM_DWHES_TABLA_COUNT_REPORT.xml',
        properties: {
          'Business Name': 'DWHES Table Metadata',
          'Database Type': 'Oracle',
          'Owner Name': 'DWHES_SCHEMA',
          'Table Name': 'TABLA_METADATA',
          'Filter Condition': "STATUS = 'ACTIVE'",
          'Row Count': '12,450',
        },
        ports: [
          { name: 'TABLA_ID', dataType: 'NUMBER(10)', direction: 'OUT', linked: true },
          { name: 'TABLA_NAME', dataType: 'VARCHAR2(100)', direction: 'OUT', linked: true },
          { name: 'ROW_COUNT', dataType: 'NUMBER(18)', direction: 'OUT', linked: true },
          { name: 'LOAD_DATE', dataType: 'DATE', direction: 'OUT', linked: true },
          { name: 'SCHEMA_NM', dataType: 'VARCHAR2(50)', direction: 'OUT', linked: false },
        ],
      },
      {
        id: 'sq1', type: 'sq', label: 'SQ', name: 'SQ_DWHES_TABLA_META',
        x: 270, y: 180, file: 'm_DM_DWHES_TABLA_COUNT_REPORT.xml',
        properties: {
          'SQL Override': "SELECT TABLA_ID, TABLA_NAME, ROW_COUNT, LOAD_DATE FROM TABLA_METADATA WHERE STATUS = 'ACTIVE'",
          'Distinct Output Rows': 'No',
          'Number of SQL Queries': '1',
          'Tracing Level': 'Normal',
        },
        ports: [
          { name: 'TABLA_ID', dataType: 'NUMBER(10)', direction: 'IN/OUT', linked: true },
          { name: 'TABLA_NAME', dataType: 'VARCHAR2(100)', direction: 'IN/OUT', linked: true },
          { name: 'ROW_COUNT', dataType: 'NUMBER(18)', direction: 'IN/OUT', linked: true },
          { name: 'LOAD_DATE', dataType: 'DATE', direction: 'IN/OUT', linked: true },
        ],
      },
      {
        id: 'exp1', type: 'expression', label: 'EXP', name: 'EXP_FORMAT_REPORT',
        x: 500, y: 180, file: 'm_DM_DWHES_TABLA_COUNT_REPORT.xml',
        properties: {
          'Description': 'Format and classify table count metrics for reporting',
          'Tracing Level': 'Normal',
          'Expressions': '4',
        },
        ports: [
          { name: 'TABLA_ID', dataType: 'NUMBER(10)', direction: 'IN', linked: true },
          { name: 'TABLA_NAME', dataType: 'VARCHAR2(100)', direction: 'IN', linked: true },
          { name: 'ROW_COUNT', dataType: 'NUMBER(18)', direction: 'IN', linked: true },
          { name: 'LOAD_DATE', dataType: 'DATE', direction: 'IN', linked: true },
          { name: 'REPORT_KEY', dataType: 'VARCHAR2(32)', direction: 'OUT', linked: true, expression: "MD5(TABLA_ID || '_' || TO_CHAR(LOAD_DATE,'YYYYMMDD'))" },
          { name: 'ROW_COUNT_FMT', dataType: 'VARCHAR2(20)', direction: 'OUT', linked: true, expression: "TO_CHAR(ROW_COUNT,'999,999,999')" },
          { name: 'LOAD_DT_STR', dataType: 'VARCHAR2(10)', direction: 'OUT', linked: true, expression: "TO_CHAR(LOAD_DATE,'YYYY-MM-DD')" },
          { name: 'COUNT_BAND', dataType: 'VARCHAR2(10)', direction: 'OUT', linked: true, expression: "IIF(ROW_COUNT>1000000,'LARGE',IIF(ROW_COUNT>100000,'MEDIUM','SMALL'))" },
        ],
      },
      {
        id: 'agg1', type: 'aggregator', label: 'AGG', name: 'AGG_DAILY_COUNTS',
        x: 730, y: 180, file: 'm_DM_DWHES_TABLA_COUNT_REPORT.xml',
        properties: {
          'Group By': 'LOAD_DT_STR, COUNT_BAND',
          'Aggregate Functions': 'COUNT(REPORT_KEY), SUM(ROW_COUNT)',
          'Cache Size': '128 MB',
          'Sorted Input': 'Yes',
        },
        ports: [
          { name: 'REPORT_KEY', dataType: 'VARCHAR2(32)', direction: 'IN', linked: true },
          { name: 'LOAD_DT_STR', dataType: 'VARCHAR2(10)', direction: 'IN', linked: true },
          { name: 'COUNT_BAND', dataType: 'VARCHAR2(10)', direction: 'IN', linked: true },
          { name: 'ROW_COUNT', dataType: 'NUMBER(18)', direction: 'IN', linked: true },
          { name: 'LOAD_DT_STR', dataType: 'VARCHAR2(10)', direction: 'OUT', linked: true },
          { name: 'COUNT_BAND', dataType: 'VARCHAR2(10)', direction: 'OUT', linked: true },
          { name: 'TABLE_CNT', dataType: 'NUMBER(10)', direction: 'OUT', linked: true },
          { name: 'TOTAL_ROWS', dataType: 'NUMBER(18)', direction: 'OUT', linked: true },
        ],
      },
      {
        id: 'tgt1', type: 'target', label: 'TGT', name: 'TGT_BQ_TABLA_COUNT_REPORT',
        x: 960, y: 180, file: '_DDL_m_DM_DWHES_TABLA_COUNT_REPORT.json',
        properties: {
          'Target Type': 'BigQuery',
          'Dataset': 'cdm_dwhes',
          'Table': 'TABLA_COUNT_REPORT',
          'Load Type': 'Insert',
          'Partition Field': 'LOAD_DT_STR',
          'Cluster Fields': 'COUNT_BAND',
          'Insert Flag': 'Yes',
          'Update Flag': 'No',
          'Delete Flag': 'No',
        },
        ports: [
          { name: 'LOAD_DT_STR', dataType: 'STRING', direction: 'IN', linked: true },
          { name: 'COUNT_BAND', dataType: 'STRING', direction: 'IN', linked: true },
          { name: 'TABLE_CNT', dataType: 'INT64', direction: 'IN', linked: true },
          { name: 'TOTAL_ROWS', dataType: 'INT64', direction: 'IN', linked: true },
        ],
      },
    ],
    connections: [
      { fromNode: 'src1', fromPort: 'TABLA_ID', toNode: 'sq1', toPort: 'TABLA_ID' },
      { fromNode: 'sq1', fromPort: 'TABLA_ID', toNode: 'exp1', toPort: 'TABLA_ID' },
      { fromNode: 'exp1', fromPort: 'REPORT_KEY', toNode: 'agg1', toPort: 'REPORT_KEY' },
      { fromNode: 'agg1', fromPort: 'TABLE_CNT', toNode: 'tgt1', toPort: 'TABLE_CNT' },
    ],
  },

  m_order_fact: {
    nodes: [
      {
        id: 'src_erp', type: 'source', label: 'SRC', name: 'SRC_ERP_ORDERS',
        x: 40, y: 160, file: 'm_ODS_CRR_FLAG_AUDIT_LOG_BPM.xml',
        properties: {
          'Business Name': 'ERP Order Header',
          'Database Type': 'Oracle',
          'Owner Name': 'ERP_SCHEMA',
          'Table Name': 'ORDER_HEADER',
          'Filter Condition': "STATUS != 'CANCELLED'",
          'Row Count': '4,823,100',
          'DB Connection': 'CONN_ERP_PROD',
        },
        ports: [
          { name: 'ORDER_ID', dataType: 'NUMBER(10)', direction: 'OUT', linked: true },
          { name: 'CUST_ID', dataType: 'NUMBER(10)', direction: 'OUT', linked: true },
          { name: 'ORDER_DATE', dataType: 'DATE', direction: 'OUT', linked: true },
          { name: 'TOTAL_AMT', dataType: 'NUMBER(18,2)', direction: 'OUT', linked: true },
          { name: 'STATUS', dataType: 'VARCHAR2(20)', direction: 'OUT', linked: true },
          { name: 'REGION_CODE', dataType: 'VARCHAR2(5)', direction: 'OUT', linked: false },
        ],
      },
      {
        id: 'sq_erp', type: 'sq', label: 'SQ', name: 'SQ_ERP_ORDERS',
        x: 270, y: 160, file: 'm_ODS_CRR_FLAG_AUDIT_LOG_BPM.xml',
        properties: {
          'SQL Override': "SELECT ORDER_ID,CUST_ID,ORDER_DATE,TOTAL_AMT,STATUS FROM ORDER_HEADER WHERE STATUS != 'CANCELLED'",
          'Distinct Output Rows': 'No',
          'Number of SQL Queries': '1',
          'Tracing Level': 'Normal',
        },
        ports: [
          { name: 'ORDER_ID', dataType: 'NUMBER(10)', direction: 'IN/OUT', linked: true },
          { name: 'CUST_ID', dataType: 'NUMBER(10)', direction: 'IN/OUT', linked: true },
          { name: 'ORDER_DATE', dataType: 'DATE', direction: 'IN/OUT', linked: true },
          { name: 'TOTAL_AMT', dataType: 'NUMBER(18,2)', direction: 'IN/OUT', linked: true },
          { name: 'STATUS', dataType: 'VARCHAR2(20)', direction: 'IN/OUT', linked: true },
        ],
      },
      {
        id: 'src_crm', type: 'source', label: 'SRC', name: 'SRC_CRM_CUSTOMERS',
        x: 40, y: 390, file: 'm_ODS_CRR_FLAG_AUDIT_LOG_BPM.xml',
        properties: {
          'Business Name': 'CRM Customer Master',
          'Database Type': 'PostgreSQL',
          'Owner Name': 'crm_public',
          'Table Name': 'CUSTOMER_MASTER',
          'Filter Condition': 'ACTIVE = TRUE',
          'Row Count': '892,440',
          'DB Connection': 'CONN_CRM_PROD',
        },
        ports: [
          { name: 'CUST_ID', dataType: 'INTEGER', direction: 'OUT', linked: true },
          { name: 'FULL_NAME', dataType: 'VARCHAR(200)', direction: 'OUT', linked: true },
          { name: 'EMAIL', dataType: 'VARCHAR(255)', direction: 'OUT', linked: true },
          { name: 'SEGMENT', dataType: 'VARCHAR(50)', direction: 'OUT', linked: true },
          { name: 'COUNTRY_CD', dataType: 'CHAR(2)', direction: 'OUT', linked: false },
        ],
      },
      {
        id: 'sq_crm', type: 'sq', label: 'SQ', name: 'SQ_CRM_CUSTOMERS',
        x: 270, y: 390, file: 'm_ODS_CRR_FLAG_AUDIT_LOG_BPM.xml',
        properties: {
          'SQL Override': 'SELECT CUST_ID,FULL_NAME,EMAIL,SEGMENT FROM CUSTOMER_MASTER WHERE ACTIVE=TRUE',
          'Distinct Output Rows': 'No',
          'Tracing Level': 'Normal',
        },
        ports: [
          { name: 'CUST_ID', dataType: 'INTEGER', direction: 'IN/OUT', linked: true },
          { name: 'FULL_NAME', dataType: 'VARCHAR(200)', direction: 'IN/OUT', linked: true },
          { name: 'EMAIL', dataType: 'VARCHAR(255)', direction: 'IN/OUT', linked: true },
          { name: 'SEGMENT', dataType: 'VARCHAR(50)', direction: 'IN/OUT', linked: true },
        ],
      },
      {
        id: 'jnr', type: 'joiner', label: 'JNR', name: 'JNR_CUST_ORDER',
        x: 500, y: 270, file: 'm_ODS_CRR_FLAG_AUDIT_LOG_BPM.xml',
        properties: {
          'Join Type': 'Normal (Inner)',
          'Join Condition': 'SQ_ERP_ORDERS.CUST_ID = SQ_CRM_CUSTOMERS.CUST_ID',
          'Master Source': 'SQ_CRM_CUSTOMERS',
          'Sorted Input': 'Yes',
        },
        ports: [
          { name: 'ORDER_ID', dataType: 'NUMBER(10)', direction: 'IN', linked: true },
          { name: 'CUST_ID', dataType: 'NUMBER(10)', direction: 'IN', linked: true },
          { name: 'ORDER_DATE', dataType: 'DATE', direction: 'IN', linked: true },
          { name: 'TOTAL_AMT', dataType: 'NUMBER(18,2)', direction: 'IN', linked: true },
          { name: 'FULL_NAME', dataType: 'VARCHAR(200)', direction: 'IN', linked: true },
          { name: 'SEGMENT', dataType: 'VARCHAR(50)', direction: 'IN', linked: true },
          { name: 'ORDER_ID', dataType: 'NUMBER(10)', direction: 'OUT', linked: true },
          { name: 'ORDER_DATE', dataType: 'DATE', direction: 'OUT', linked: true },
          { name: 'TOTAL_AMT', dataType: 'NUMBER(18,2)', direction: 'OUT', linked: true },
          { name: 'FULL_NAME', dataType: 'VARCHAR(200)', direction: 'OUT', linked: true },
          { name: 'SEGMENT', dataType: 'VARCHAR(50)', direction: 'OUT', linked: true },
        ],
      },
      {
        id: 'exp', type: 'expression', label: 'EXP', name: 'EXP_CALC_METRICS',
        x: 730, y: 270, file: 'm_ODS_CRR_FLAG_AUDIT_LOG_BPM.xml',
        properties: {
          'Description': 'Calculate derived order metrics and normalize segment codes',
          'Tracing Level': 'Normal',
          'Expressions': '5',
        },
        ports: [
          { name: 'ORDER_ID', dataType: 'NUMBER(10)', direction: 'IN', linked: true },
          { name: 'ORDER_DATE', dataType: 'DATE', direction: 'IN', linked: true },
          { name: 'TOTAL_AMT', dataType: 'NUMBER(18,2)', direction: 'IN', linked: true },
          { name: 'FULL_NAME', dataType: 'VARCHAR(200)', direction: 'IN', linked: true },
          { name: 'SEGMENT', dataType: 'VARCHAR(50)', direction: 'IN', linked: true },
          { name: 'ORDER_ID', dataType: 'NUMBER(10)', direction: 'OUT', linked: true, expression: 'ORDER_ID' },
          { name: 'ORDER_YEAR', dataType: 'INTEGER', direction: 'OUT', linked: true, expression: "TO_NUMBER(TO_CHAR(ORDER_DATE,'YYYY'))" },
          { name: 'ORDER_MONTH', dataType: 'INTEGER', direction: 'OUT', linked: true, expression: "TO_NUMBER(TO_CHAR(ORDER_DATE,'MM'))" },
          { name: 'TOTAL_AMT_USD', dataType: 'NUMBER(18,2)', direction: 'OUT', linked: true, expression: 'ROUND(TOTAL_AMT * v_FX_RATE, 2)' },
          { name: 'SEGMENT_CD', dataType: 'VARCHAR2(10)', direction: 'OUT', linked: true, expression: "UPPER(SUBSTR(SEGMENT,1,10))" },
        ],
      },
      {
        id: 'agg', type: 'aggregator', label: 'AGG', name: 'AGG_DAILY_TOTALS',
        x: 960, y: 270, file: 'm_ODS_CRR_FLAG_AUDIT_LOG_BPM.xml',
        properties: {
          'Group By': 'ORDER_YEAR, ORDER_MONTH, SEGMENT_CD',
          'Aggregate Functions': 'SUM(TOTAL_AMT_USD), COUNT(ORDER_ID), AVG(TOTAL_AMT_USD)',
          'Cache Size': '256 MB',
          'Sorted Input': 'No',
        },
        ports: [
          { name: 'ORDER_ID', dataType: 'NUMBER(10)', direction: 'IN', linked: true },
          { name: 'ORDER_YEAR', dataType: 'INTEGER', direction: 'IN', linked: true },
          { name: 'ORDER_MONTH', dataType: 'INTEGER', direction: 'IN', linked: true },
          { name: 'TOTAL_AMT_USD', dataType: 'NUMBER(18,2)', direction: 'IN', linked: true },
          { name: 'SEGMENT_CD', dataType: 'VARCHAR2(10)', direction: 'IN', linked: true },
          { name: 'ORDER_YEAR', dataType: 'INTEGER', direction: 'OUT', linked: true },
          { name: 'ORDER_MONTH', dataType: 'INTEGER', direction: 'OUT', linked: true },
          { name: 'SEGMENT_CD', dataType: 'VARCHAR2(10)', direction: 'OUT', linked: true },
          { name: 'TOTAL_REVENUE', dataType: 'NUMBER(18,2)', direction: 'OUT', linked: true },
          { name: 'ORDER_COUNT', dataType: 'INTEGER', direction: 'OUT', linked: true },
        ],
      },
      {
        id: 'tgt', type: 'target', label: 'TGT', name: 'TGT_BQ_ORDER_FACT',
        x: 1190, y: 270, file: '_DDL_m_ODS_CRR_FLAG_AUDIT_LOG_BPM.json',
        properties: {
          'Target Type': 'BigQuery',
          'Dataset': 'ods_crr',
          'Table': 'ORDER_FACT',
          'Load Type': 'Insert',
          'Partition Field': 'ORDER_YEAR, ORDER_MONTH',
          'Cluster Fields': 'SEGMENT_CD',
          'Insert Flag': 'Yes',
          'Update Flag': 'No',
          'Delete Flag': 'No',
        },
        ports: [
          { name: 'ORDER_YEAR', dataType: 'INT64', direction: 'IN', linked: true },
          { name: 'ORDER_MONTH', dataType: 'INT64', direction: 'IN', linked: true },
          { name: 'SEGMENT_CD', dataType: 'STRING', direction: 'IN', linked: true },
          { name: 'TOTAL_REVENUE', dataType: 'NUMERIC', direction: 'IN', linked: true },
          { name: 'ORDER_COUNT', dataType: 'INT64', direction: 'IN', linked: true },
        ],
      },
    ],
    connections: [
      { fromNode: 'src_erp', fromPort: 'ORDER_ID', toNode: 'sq_erp', toPort: 'ORDER_ID' },
      { fromNode: 'sq_erp', fromPort: 'ORDER_ID', toNode: 'jnr', toPort: 'ORDER_ID' },
      { fromNode: 'src_crm', fromPort: 'CUST_ID', toNode: 'sq_crm', toPort: 'CUST_ID' },
      { fromNode: 'sq_crm', fromPort: 'CUST_ID', toNode: 'jnr', toPort: 'CUST_ID' },
      { fromNode: 'jnr', fromPort: 'ORDER_ID', toNode: 'exp', toPort: 'ORDER_ID' },
      { fromNode: 'exp', fromPort: 'ORDER_ID', toNode: 'agg', toPort: 'ORDER_ID' },
      { fromNode: 'agg', fromPort: 'TOTAL_REVENUE', toNode: 'tgt', toPort: 'TOTAL_REVENUE' },
    ],
  },

  m_customer_dim: {
    nodes: [
      {
        id: 'src_c', type: 'source', label: 'SRC', name: 'SRC_CRM_CUSTOMERS',
        x: 40, y: 200, file: 'm_DM_DWHES_CUSTOMER_PROFILE.xml',
        properties: {
          'Business Name': 'CRM Customer Master',
          'Database Type': 'PostgreSQL',
          'Owner Name': 'crm_public',
          'Table Name': 'CUSTOMER_MASTER',
          'Filter Condition': 'ACTIVE = TRUE AND GDPR_CONSENT = TRUE',
          'Row Count': '892,440',
        },
        ports: [
          { name: 'CUST_ID', dataType: 'INTEGER', direction: 'OUT', linked: true },
          { name: 'FULL_NAME', dataType: 'VARCHAR(200)', direction: 'OUT', linked: true },
          { name: 'EMAIL', dataType: 'VARCHAR(255)', direction: 'OUT', linked: true },
          { name: 'SEGMENT', dataType: 'VARCHAR(50)', direction: 'OUT', linked: true },
        ],
      },
      {
        id: 'sq_c', type: 'sq', label: 'SQ', name: 'SQ_CRM_CUSTOMERS',
        x: 270, y: 200, file: 'm_DM_DWHES_CUSTOMER_PROFILE.xml',
        properties: {
          'SQL Override': 'SELECT CUST_ID,FULL_NAME,EMAIL,SEGMENT FROM CUSTOMER_MASTER WHERE ACTIVE=TRUE',
          'Tracing Level': 'Normal',
        },
        ports: [
          { name: 'CUST_ID', dataType: 'INTEGER', direction: 'IN/OUT', linked: true },
          { name: 'FULL_NAME', dataType: 'VARCHAR(200)', direction: 'IN/OUT', linked: true },
          { name: 'EMAIL', dataType: 'VARCHAR(255)', direction: 'IN/OUT', linked: true },
          { name: 'SEGMENT', dataType: 'VARCHAR(50)', direction: 'IN/OUT', linked: true },
        ],
      },
      {
        id: 'exp_c', type: 'expression', label: 'EXP', name: 'EXP_NORMALIZE_CUSTOMER',
        x: 500, y: 200, file: 'm_DM_DWHES_CUSTOMER_PROFILE.xml',
        properties: {
          'Description': 'Normalize and cleanse customer data',
          'Tracing Level': 'Normal',
          'Expressions': '3',
        },
        ports: [
          { name: 'CUST_ID', dataType: 'INTEGER', direction: 'IN', linked: true },
          { name: 'FULL_NAME', dataType: 'VARCHAR(200)', direction: 'IN', linked: true },
          { name: 'SEGMENT', dataType: 'VARCHAR(50)', direction: 'IN', linked: true },
          { name: 'CUST_KEY', dataType: 'VARCHAR2(32)', direction: 'OUT', linked: true, expression: "MD5(TO_CHAR(CUST_ID))" },
          { name: 'CUST_NAME_CLEAN', dataType: 'VARCHAR2(200)', direction: 'OUT', linked: true, expression: "INITCAP(LTRIM(RTRIM(FULL_NAME)))" },
          { name: 'SEGMENT_GROUP', dataType: 'VARCHAR2(20)', direction: 'OUT', linked: true, expression: "IIF(INSTR(SEGMENT,'VIP')>0,'PREMIUM',IIF(INSTR(SEGMENT,'SMB')>0,'SMB','STANDARD'))" },
        ],
      },
      {
        id: 'tgt_c', type: 'target', label: 'TGT', name: 'TGT_BQ_CUSTOMER_DIM',
        x: 730, y: 200, file: '_DDL_m_DM_DWHES_CUSTOMER_PROFILE.json',
        properties: {
          'Target Type': 'BigQuery',
          'Dataset': 'cdm_dwhes',
          'Table': 'CUSTOMER_DIM',
          'Load Type': 'Upsert',
          'Key Column': 'CUST_KEY',
          'Insert Flag': 'Yes',
          'Update Flag': 'Yes',
          'Delete Flag': 'No',
        },
        ports: [
          { name: 'CUST_KEY', dataType: 'STRING', direction: 'IN', linked: true },
          { name: 'CUST_NAME_CLEAN', dataType: 'STRING', direction: 'IN', linked: true },
          { name: 'SEGMENT_GROUP', dataType: 'STRING', direction: 'IN', linked: true },
        ],
      },
    ],
    connections: [
      { fromNode: 'src_c', fromPort: 'CUST_ID', toNode: 'sq_c', toPort: 'CUST_ID' },
      { fromNode: 'sq_c', fromPort: 'CUST_ID', toNode: 'exp_c', toPort: 'CUST_ID' },
      { fromNode: 'exp_c', fromPort: 'CUST_KEY', toNode: 'tgt_c', toPort: 'CUST_KEY' },
    ],
  },
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
