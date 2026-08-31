import React from 'react'

type GCPService =
  'bigquery' | 'dataproc' | 'pubsub' | 'logging' | 'airflow' | 'dataflow' | 'monitoring'

const ICONS: Record<GCPService, (size: number) => React.ReactElement> = {
  bigquery: s => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M12 2L2 7l10 5 10-5L12 2z" fill="#4285F4" opacity="0.9" />
      <path
        d="M2 17l10 5 10-5"
        stroke="#34A853"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M2 12l10 5 10-5"
        stroke="#4285F4"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  ),
  dataproc: s => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="#FBBC04"
        opacity="0.2"
        stroke="#FBBC04"
        strokeWidth="1.5"
      />
      <path d="M8 12h8M12 8v8" stroke="#FBBC04" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2.5" fill="#FBBC04" />
    </svg>
  ),
  pubsub: s => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <circle cx="6" cy="12" r="2.5" fill="#EA4335" />
      <circle cx="18" cy="7" r="2.5" fill="#EA4335" />
      <circle cx="18" cy="17" r="2.5" fill="#EA4335" />
      <line x1="8.5" y1="11" x2="15.5" y2="8" stroke="#EA4335" strokeWidth="1.5" />
      <line x1="8.5" y1="13" x2="15.5" y2="16" stroke="#EA4335" strokeWidth="1.5" />
    </svg>
  ),
  logging: s => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="2"
        fill="#4285F4"
        opacity="0.15"
        stroke="#4285F4"
        strokeWidth="1.5"
      />
      <line x1="7" y1="8" x2="17" y2="8" stroke="#4285F4" strokeWidth="1.5" strokeLinecap="round" />
      <line
        x1="7"
        y1="12"
        x2="14"
        y2="12"
        stroke="#4285F4"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="7"
        y1="16"
        x2="11"
        y2="16"
        stroke="#4285F4"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  airflow: s => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3C7 3 3 7 3 12s4 9 9 9 9-4 9-9-4-9-9-9z"
        fill="#017CEE"
        opacity="0.15"
        stroke="#017CEE"
        strokeWidth="1.5"
      />
      <path
        d="M8 12l2.5 2.5L16 9"
        stroke="#017CEE"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  dataflow: s => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path
        d="M4 12h16M14 7l5 5-5 5"
        stroke="#34A853"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="12" r="2" fill="#34A853" opacity="0.6" />
    </svg>
  ),
  monitoring: s => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <rect
        x="3"
        y="4"
        width="18"
        height="13"
        rx="2"
        fill="#FBBC04"
        opacity="0.15"
        stroke="#FBBC04"
        strokeWidth="1.5"
      />
      <path
        d="M6 13l3-4 3 2 3-5 3 3"
        stroke="#FBBC04"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="8"
        y1="20"
        x2="16"
        y2="20"
        stroke="#FBBC04"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
}

export function GCPIcon({ service, size = 16 }: { service: GCPService; size?: number }) {
  return ICONS[service]?.(size) ?? null
}
