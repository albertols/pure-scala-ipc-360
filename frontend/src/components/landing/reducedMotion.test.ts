import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Despite the file's name, this only inspects `index.css`'s TEXT — it never renders anything
// and never exercises `App.tsx`'s runtime. It cannot catch a JS-side reduced-motion bug (e.g. a
// `setTimeout` delay that ignores `prefers-reduced-motion` even though the CSS keyframes it
// gates correctly no-op — fix round 1, Finding 1) — that class of bug needs a component/behaviour
// test (see `App.test.tsx`'s "skips the transition delay under prefers-reduced-motion" test).
const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8')

/** Every class this sub-project animates. Add to this list when adding a keyframe. */
const ANIMATED = [
  'mascot-hero',
  'bubble',
  'twig',
  'steam',
  'shear-glint',
  'landing-exit',
  'shell-enter',
]

describe('reduced motion', () => {
  it('has a prefers-reduced-motion block', () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
  })

  // ADR-0005 sanctions animation utilities; it does not sanction ignoring the OS setting.
  it('disables every animated landing class under reduced motion', () => {
    const blocks =
      css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/g) ?? []
    const combined = blocks.join('\n')
    for (const cls of ANIMATED) {
      expect(combined, `.${cls} has no reduced-motion rule`).toContain(cls)
    }
  })
})
