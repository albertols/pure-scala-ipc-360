import mascotHero from '../../assets/mascot-hero.jpg'

/**
 * The mascot IS the readiness indicator — not decoration beside one.
 *
 * The source image is a complete photographed scene (mascot, cypress avenue, sky, grass), not a
 * cut-out sprite, and this machine has only `sips` (no cwebp/ImageMagick/Pillow) — so a
 * PNG-with-alpha composite was rejected as too heavy (672 KB vs 151 KB for JPEG). The image is
 * therefore the hero BACKDROP; mood is carried by an animated SVG overlay and a CSS colour grade
 * rendered over it, not by swapping the character. His pose does not change between moods — a
 * known, accepted limitation (spec §5).
 */

export type ReadinessStatus = 'ok' | 'degraded'

export interface FailingRoot {
  name: string
  hint: string | null
}

export interface MascotSceneProps {
  status: ReadinessStatus
  failingRoot: FailingRoot | null
}

const GRADE: Record<ReadinessStatus, string> = {
  ok: 'saturate(1.15) brightness(1.02)',
  degraded: 'saturate(0.7) brightness(0.9)',
}

// The vignette darkens toward --bg (#0b0d14) at the edges. `color-mix()` derives that colour
// from the token itself — Tailwind v4 (already a dependency here) requires a browser baseline
// that supports it, so this is not a stretch — rather than hand-decomposing the hex into a
// second, driftable `rgba(11,13,20,…)` literal.
const VIGNETTE: Record<ReadinessStatus, string> = {
  ok: 'radial-gradient(ellipse at 50% 45%, transparent 45%, color-mix(in srgb, var(--bg) 25%, transparent) 100%)',
  degraded: 'radial-gradient(ellipse at 50% 45%, transparent 30%, color-mix(in srgb, var(--bg) 60%, transparent) 100%)',
}

/** Bubble positions, staggered so they don't rise in lockstep — viewBox 0 0 600 600. */
const BUBBLES = [
  { cx: 90, cy: 540, r: 8 },
  { cx: 140, cy: 560, r: 5 },
  { cx: 200, cy: 520, r: 10 },
  { cx: 260, cy: 555, r: 6 },
  { cx: 330, cy: 530, r: 9 },
  { cx: 400, cy: 560, r: 5 },
  { cx: 460, cy: 525, r: 11 },
  { cx: 520, cy: 550, r: 7 },
]

/** Twig fall start positions, staggered so they don't drop in lockstep — viewBox 0 0 600 600. */
const TWIGS = [
  { x: 60, y: 40, d: 'M0,0 l14,7 l10,-5' },
  { x: 140, y: 20, d: 'M0,0 l-12,8 l9,4' },
  { x: 230, y: 55, d: 'M0,0 l16,4 l-6,9' },
  { x: 320, y: 15, d: 'M0,0 l-10,10 l12,2' },
  { x: 420, y: 45, d: 'M0,0 l13,-6 l4,11' },
  { x: 500, y: 25, d: 'M0,0 l-15,5 l8,8' },
]

export function MascotScene({ status, failingRoot }: MascotSceneProps) {
  const ok = status === 'ok'

  return (
    <div
      data-testid="mascot-scene"
      data-mood={status}
      style={{
        position: 'relative',
        borderRadius: 12,
        border: '1px solid var(--border)',
        overflow: 'hidden',
        background: 'var(--surface)',
      }}
    >
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          aspectRatio: '1 / 1',
          filter: GRADE[status],
        }}
      >
        <img
          src={mascotHero}
          alt="ETL 360 mascot among the cypress trees"
          className="mascot-hero"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        <div
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, background: VIGNETTE[status], pointerEvents: 'none' }}
        />
        {ok ? (
          <svg
            data-testid="overlay-bubbles"
            aria-hidden="true"
            viewBox="0 0 600 600"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            {BUBBLES.map((b, i) => (
              <circle
                key={i}
                className="bubble"
                cx={b.cx}
                cy={b.cy}
                r={b.r}
                fill="var(--cyan)"
                opacity={0.65}
                style={{ animationDelay: `${(i * 0.55).toFixed(2)}s` }}
              />
            ))}
            <path
              className="steam"
              d="M230,560 C215,500 260,470 245,410"
              stroke="var(--cyan)"
              strokeWidth={2}
              fill="none"
              opacity={0.4}
            />
            <path
              className="steam"
              d="M370,560 C385,500 340,470 355,410"
              stroke="var(--cyan)"
              strokeWidth={2}
              fill="none"
              opacity={0.4}
            />
          </svg>
        ) : (
          <svg
            data-testid="overlay-twigs"
            aria-hidden="true"
            viewBox="0 0 600 600"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            {TWIGS.map((t, i) => (
              <path
                key={i}
                className="twig"
                d={t.d}
                transform={`translate(${t.x}, ${t.y})`}
                stroke="var(--orange)"
                strokeWidth={2}
                fill="none"
                opacity={0.85}
                style={{ animationDelay: `${(i * 0.65).toFixed(2)}s` }}
              />
            ))}
            <line
              className="shear-glint"
              x1={70}
              y1={90}
              x2={520}
              y2={150}
              stroke="var(--text)"
              strokeWidth={1.5}
              opacity={0.3}
            />
          </svg>
        )}
      </div>

      {!ok && failingRoot && (
        // Deliberately a single text run rather than separate name/hint elements: a hint like
        // "set composerRoot in config.json" contains the root's own name as a substring, so two
        // sibling elements would both match a query for the root name and be ambiguous. One node,
        // one match.
        <div
          data-testid="mascot-callout"
          style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}
        >
          {`${failingRoot.name} needs attention`}
          {failingRoot.hint ? ` — ${failingRoot.hint}` : null}
        </div>
      )}
    </div>
  )
}
