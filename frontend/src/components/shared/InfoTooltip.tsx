import { useState } from 'react'

export function InfoTooltip({ text, placement = 'top' }: { text: string; placement?: 'top' | 'right' | 'bottom' }) {
  const [visible, setVisible] = useState(false)

  const tipStyle: React.CSSProperties = {
    position: 'absolute',
    zIndex: 9999,
    background: '#1a1f30',
    border: '1px solid #2a3050',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 11,
    color: '#c8d3e8',
    whiteSpace: 'pre-wrap',
    maxWidth: 240,
    lineHeight: 1.5,
    pointerEvents: 'none',
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
    ...(placement === 'top' ? { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6 } : {}),
    ...(placement === 'right' ? { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: 6 } : {}),
    ...(placement === 'bottom' ? { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6 } : {}),
  }

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'help' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="var(--text-muted)" strokeWidth="1.2" />
        <text x="6" y="9" textAnchor="middle" fill="var(--text-muted)" style={{ fontSize: 7, fontFamily: 'serif', fontWeight: 'bold' }}>i</text>
      </svg>
      {visible && <div style={tipStyle}>{text}</div>}
    </span>
  )
}
