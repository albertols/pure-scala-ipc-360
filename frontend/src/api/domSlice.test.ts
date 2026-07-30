import { describe, expect, it } from 'vitest'
import { findElementForNode } from './domSlice'
import type { XmlNode } from './queries'

// Small folder subtree: SOURCE + TARGET direct under FOLDER, a reusable
// TRANSFORMATION direct under FOLDER, and a MAPPING with an INSTANCE whose
// NAME differs from its TRANSFORMATION_NAME (the indirection case).
const DOM: XmlNode = {
  name: 'POWERMART',
  attributes: {},
  children: [
    {
      name: 'REPOSITORY',
      attributes: { NAME: 'REP_FIX' },
      children: [
        {
          name: 'FOLDER',
          attributes: { NAME: 'CDM' },
          children: [
            {
              name: 'SOURCE',
              attributes: { NAME: 'SRC_FIX', DATABASETYPE: 'Oracle' },
              children: [
                { name: 'SOURCEFIELD', attributes: { NAME: 'ID' }, children: [] },
              ],
            },
            {
              name: 'TARGET',
              attributes: { NAME: 'TGT_FIX', DATABASETYPE: 'Oracle' },
              children: [
                { name: 'TARGETFIELD', attributes: { NAME: 'ID' }, children: [] },
              ],
            },
            {
              name: 'TRANSFORMATION',
              attributes: { NAME: 'EXP_FIX', TYPE: 'Expression' },
              children: [
                { name: 'TRANSFORMFIELD', attributes: { NAME: 'ID' }, children: [] },
              ],
            },
            {
              name: 'MAPPING',
              attributes: { NAME: 'm_FIX' },
              children: [
                {
                  name: 'INSTANCE',
                  attributes: { NAME: 'EXP_INST', TRANSFORMATION_NAME: 'EXP_FIX', TYPE: 'TRANSFORMATION' },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

describe('findElementForNode', () => {
  it('matches a SOURCE directly by attributes.NAME', () => {
    const el = findElementForNode(DOM, 'SRC_FIX', 'source')
    expect(el?.name).toBe('SOURCE')
    expect(el?.attributes?.NAME).toBe('SRC_FIX')
  })

  it('matches a TARGET directly by attributes.NAME', () => {
    const el = findElementForNode(DOM, 'TGT_FIX', 'target')
    expect(el?.name).toBe('TARGET')
  })

  it('falls back through INSTANCE indirection to find the TRANSFORMATION', () => {
    // 'EXP_INST' is the instance name, not the transformation name — no
    // direct TRANSFORMATION named EXP_INST exists, so the locator must find
    // the INSTANCE, read TRANSFORMATION_NAME='EXP_FIX', and retry.
    const el = findElementForNode(DOM, 'EXP_INST', 'expression')
    expect(el?.name).toBe('TRANSFORMATION')
    expect(el?.attributes?.NAME).toBe('EXP_FIX')
  })

  it('returns null for an unknown name', () => {
    expect(findElementForNode(DOM, 'DOES_NOT_EXIST', 'source')).toBeNull()
  })
})
