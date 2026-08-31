import type { TabId } from '../../types'
import { TABS, FUTURE_TABS } from '../../tabs'

/**
 * "A brief introduction what's expected from each tab" — one card per entry in `TABS`
 * (the same array that drives `App.tsx`'s tab strip, so a card can never describe a tab
 * that no longer exists or omit one that does). Presentational only: the caller
 * (Task 10) owns the `view: 'landing' | 'tabs'` switch and passes `onEnter`.
 *
 * `FUTURE_TABS` render as non-interactive cards — offering entry into a tab that has no
 * shell behind it would be a worse experience than not listing it at all (see the same
 * disabled treatment already in `App.tsx`'s top bar, `FUTURE_TABS.map` there).
 */

export interface TabPreviewProps {
  onEnter: (tab: TabId) => void
}

/**
 * `FUTURE_TABS[].desc` carries its own "coming soon" suffix (e.g. "Spark engine performance
 * tuner — coming soon") because it also serves as the hover tooltip in `App.tsx`'s top bar.
 * The card renders the suffix as a dedicated chip instead, so the raw suffix is stripped here
 * — an em/en dash or hyphen followed by "coming soon" at the end of the string, case
 * insensitive — leaving the descriptive remainder as always-visible body text. Not hard-coded
 * to the two current strings: any future `FUTURE_TABS` entry following the same "<description>
 * — coming soon" shape strips the same way.
 */
function stripComingSoon(desc: string): string {
  return desc.replace(/\s*[-–—]\s*coming soon\s*$/i, '').trim()
}

export function TabPreview({ onEnter }: TabPreviewProps) {
  return (
    <div
      data-testid="tab-preview"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
      }}
    >
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onEnter(tab.id)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            textAlign: 'left',
            padding: '14px 16px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            cursor: 'pointer',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: tab.accent, display: 'flex' }}>{tab.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: tab.accent }}>{tab.label}</span>
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {tab.description}
          </span>
        </button>
      ))}

      {FUTURE_TABS.map(ft => (
        <div
          key={ft.label}
          title={ft.desc}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '14px 16px',
            borderRadius: 10,
            border: '1px solid var(--border-subtle)',
            background: 'var(--surface)',
            cursor: 'not-allowed',
            opacity: 0.6,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>
              {ft.label}
            </span>
            <span
              style={{
                fontSize: 9,
                fontFamily: 'JetBrains Mono, monospace',
                color: 'var(--text-dim)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 4,
                padding: '1px 5px',
              }}
            >
              coming soon
            </span>
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            {stripComingSoon(ft.desc)}
          </span>
        </div>
      ))}
    </div>
  )
}
