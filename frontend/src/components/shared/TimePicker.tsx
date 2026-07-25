import type { } from 'react'
import { InfoTooltip } from './InfoTooltip'

export type Precision = 'minute' | 'hour' | 'day'

export interface TimeSelection {
  date: string
  hour: number
  precision: Precision
  isNow: boolean
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function currentHour() {
  return new Date().getUTCHours()
}

export function TimePicker({ value, onChange }: {
  value: TimeSelection
  onChange: (v: TimeSelection) => void
}) {
  const setNow = () => onChange({ date: todayStr(), hour: currentHour(), precision: 'hour', isNow: true })

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 7,
      padding: '6px 12px',
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 10, color: '#4a5570', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>
        Time View <InfoTooltip text="Navigate to a historical snapshot of the operational state. 'Now' shows the current live state." placement="bottom" />
      </span>

      <input
        type="date"
        value={value.date}
        max={todayStr()}
        onChange={e => onChange({ ...value, date: e.target.value, isNow: false })}
        style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 5,
          color: '#c8d3e8', fontSize: 11, padding: '3px 6px',
          fontFamily: 'JetBrains Mono, monospace', cursor: 'pointer',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: '#4a5570' }}>Hour</span>
        <input
          type="range"
          min={0} max={23} value={value.hour}
          onChange={e => onChange({ ...value, hour: Number(e.target.value), isNow: false })}
          style={{ width: 80, accentColor: '#4f9cf9' }}
        />
        <span style={{ fontSize: 11, color: '#c8d3e8', fontFamily: 'JetBrains Mono, monospace', width: 20 }}>
          {String(value.hour).padStart(2, '0')}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 3 }}>
        {(['minute', 'hour', 'day'] as Precision[]).map(p => (
          <button
            key={p}
            onClick={() => onChange({ ...value, precision: p, isNow: false })}
            style={{
              padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)',
              background: value.precision === p ? 'var(--surface-3)' : 'transparent',
              color: value.precision === p ? '#e2e8f8' : '#4a5570',
              fontSize: 10, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
            }}
          >{p}</button>
        ))}
      </div>

      <button
        onClick={setNow}
        style={{
          padding: '3px 10px', borderRadius: 5,
          background: value.isNow ? 'rgba(79,156,249,0.15)' : 'transparent',
          border: `1px solid ${value.isNow ? '#4f9cf9' : 'var(--border)'}`,
          color: value.isNow ? '#4f9cf9' : '#7b88aa',
          fontSize: 11, cursor: 'pointer', fontWeight: 600,
        }}
      >Now</button>

      {!value.isNow && (
        <span style={{ fontSize: 10, color: '#4a5570', fontFamily: 'JetBrains Mono, monospace' }}>
          {value.date} {String(value.hour).padStart(2, '0')}:00 UTC ({value.precision})
        </span>
      )}
    </div>
  )
}
