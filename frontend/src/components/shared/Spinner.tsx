// ─── Shared loading chrome (Task 17) ────────────────────────────────────────
//
// One idiom for every "waiting on the network" moment in the app, replacing
// four tabs' worth of ad-hoc `Loading …` text nodes:
//   - `Spinner` — a small SVG arc, rotated via the `.spinner-arc` CSS
//     `@keyframes` in `index.css` (an animation utility, not a new design
//     token — ADR-0005 sanctions it). `--text-dim` only, no new colors.
//   - `LoadingState` — `Spinner` + a label, the drop-in replacement for every
//     `<div>Loading …</div>` call site. Callers keep their own layout wrapper
//     (padding/centering) and just swap the text node for this.
//   - `TopProgressBar` — a 2px bar driven by `useIsFetching()`, mounted once
//     in `App.tsx`. Delays showing by `SHOW_DELAY_MS` so a fetch that
//     resolves before the delay elapses never flashes the bar at all (no
//     flicker on trivial background refetches), and hides the instant the
//     in-flight count returns to zero — including after a retry exhausts or
//     a query ultimately fails — so it can never stay lit forever.

import { useEffect, useState } from 'react'
import { useIsFetching } from '@tanstack/react-query'

const SHOW_DELAY_MS = 150

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg
      role="status"
      aria-label="Loading"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="spinner-arc"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="var(--text-dim)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="32 100"
      />
    </svg>
  )
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        color: 'var(--text-dim)',
        fontSize: 12,
      }}
    >
      <Spinner size={14} />
      <span>{label}</span>
    </div>
  )
}

export function TopProgressBar() {
  const fetching = useIsFetching() > 0
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!fetching) {
      setVisible(false)
      return
    }
    const timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [fetching])

  if (!visible) return null

  return (
    <div
      role="progressbar"
      aria-label="Loading"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        zIndex: 1000,
        background: '#4f9cf9',
        boxShadow: '0 0 6px rgba(79,156,249,0.6)',
      }}
    />
  )
}
