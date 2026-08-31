// Extracted from Tab 3's toolbar so the lineage view renders the SAME bar rather than a lookalike
// — spec §15.5. One implementation, one behaviour.

/**
 * A chip group whose selection is a SET.
 *
 * `ALL` is not an option value — it is the clear control, and it renders active exactly when the
 * set is empty. That keeps "no filter" and "every value selected" from being two states that
 * look different but mean the same thing.
 */
export function MultiFilterChips({
  testId,
  label,
  options,
  selected,
  onToggle,
  colors,
}: {
  testId: string
  label: string
  options: string[]
  selected: string[]
  onToggle: (next: string[]) => void
  colors?: Record<string, string>
}) {
  const toggle = (o: string) =>
    onToggle(selected.includes(o) ? selected.filter(v => v !== o) : [...selected, o])

  return (
    <div data-testid={testId} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 10, color: '#4a5570', marginRight: 2 }}>{label}:</span>
      <button
        onClick={() => onToggle([])}
        aria-pressed={selected.length === 0}
        style={{
          padding: '2px 8px',
          borderRadius: 4,
          fontSize: 10,
          cursor: 'pointer',
          fontFamily: 'JetBrains Mono, monospace',
          background: selected.length === 0 ? 'var(--surface-3)' : 'transparent',
          border: `1px solid ${selected.length === 0 ? 'var(--border)' : 'transparent'}`,
          color: selected.length === 0 ? '#e2e8f8' : '#4a5570',
        }}
      >
        ALL
      </button>
      {options.map(o => {
        const c = colors?.[o]
        const on = selected.includes(o)
        return (
          <button
            key={o}
            onClick={() => toggle(o)}
            aria-pressed={on}
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 10,
              cursor: 'pointer',
              fontFamily: 'JetBrains Mono, monospace',
              background: on ? (c ? `${c}22` : 'var(--surface-3)') : 'transparent',
              border: `1px solid ${on ? (c ?? 'var(--border)') : 'transparent'}`,
              // Unselected chips keep their palette colour — the row is the legend (ADR-0017).
              color: on ? (c ?? '#e2e8f8') : (c ?? '#4a5570'),
              fontWeight: on ? 700 : 400,
            }}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}
