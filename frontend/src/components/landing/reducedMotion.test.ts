import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8')

/** Every class this sub-project animates. Add to this list when adding a keyframe. */
const ANIMATED = ['mascot-hero', 'bubble', 'twig']

describe('reduced motion', () => {
  it('has a prefers-reduced-motion block', () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
  })

  // ADR-0005 sanctions animation utilities; it does not sanction ignoring the OS setting.
  it('disables every animated landing class under reduced motion', () => {
    const blocks = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/g) ?? []
    const combined = blocks.join('\n')
    for (const cls of ANIMATED) {
      expect(combined, `.${cls} has no reduced-motion rule`).toContain(cls)
    }
  })
})
