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

// Two-mapping folder: same INSTANCE name ('SHARED_INST') appears in both
// mappings but resolves to a DIFFERENT transformation in each — proves the
// INSTANCE-fallback lookup is scoped to the rendered mapping, not folder-wide.
const TWO_MAPPING_DOM: XmlNode = {
  name: 'POWERMART',
  attributes: {},
  children: [
    {
      name: 'REPOSITORY',
      attributes: { NAME: 'REP_SHARED' },
      children: [
        {
          name: 'FOLDER',
          attributes: { NAME: 'CDM' },
          children: [
            { name: 'TRANSFORMATION', attributes: { NAME: 'EXP_ONE', TYPE: 'Expression' }, children: [] },
            { name: 'TRANSFORMATION', attributes: { NAME: 'EXP_TWO', TYPE: 'Expression' }, children: [] },
            {
              name: 'MAPPING',
              attributes: { NAME: 'm_ONE' },
              children: [
                { name: 'INSTANCE', attributes: { NAME: 'SHARED_INST', TRANSFORMATION_NAME: 'EXP_ONE', TYPE: 'TRANSFORMATION' }, children: [] },
              ],
            },
            {
              name: 'MAPPING',
              attributes: { NAME: 'm_TWO' },
              children: [
                { name: 'INSTANCE', attributes: { NAME: 'SHARED_INST', TRANSFORMATION_NAME: 'EXP_TWO', TYPE: 'TRANSFORMATION' }, children: [] },
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
    const el = findElementForNode(DOM, 'SRC_FIX', 'source', 'm_FIX')
    expect(el?.name).toBe('SOURCE')
    expect(el?.attributes?.NAME).toBe('SRC_FIX')
  })

  it('matches a TARGET directly by attributes.NAME', () => {
    const el = findElementForNode(DOM, 'TGT_FIX', 'target', 'm_FIX')
    expect(el?.name).toBe('TARGET')
  })

  it('falls back through INSTANCE indirection to find the TRANSFORMATION', () => {
    // 'EXP_INST' is the instance name, not the transformation name — no
    // direct TRANSFORMATION named EXP_INST exists, so the locator must find
    // the INSTANCE, read TRANSFORMATION_NAME='EXP_FIX', and retry.
    const el = findElementForNode(DOM, 'EXP_INST', 'expression', 'm_FIX')
    expect(el?.name).toBe('TRANSFORMATION')
    expect(el?.attributes?.NAME).toBe('EXP_FIX')
  })

  it('returns null for an unknown name', () => {
    expect(findElementForNode(DOM, 'DOES_NOT_EXIST', 'source', 'm_FIX')).toBeNull()
  })

  it('scopes the INSTANCE fallback to the rendered mapping when the same instance name is reused across mappings', () => {
    const inMappingOne = findElementForNode(TWO_MAPPING_DOM, 'SHARED_INST', 'expression', 'm_ONE')
    expect(inMappingOne?.attributes?.NAME).toBe('EXP_ONE')

    const inMappingTwo = findElementForNode(TWO_MAPPING_DOM, 'SHARED_INST', 'expression', 'm_TWO')
    expect(inMappingTwo?.attributes?.NAME).toBe('EXP_TWO')
  })

  it('falls back to a folder-wide INSTANCE search when the given mapping name is not found', () => {
    // Neither mapping is named 'm_MISSING' — the scoped lookup can't find a
    // <MAPPING> element to scope into, so it degrades to the pre-Finding-2
    // folder-wide search rather than failing outright.
    const el = findElementForNode(TWO_MAPPING_DOM, 'SHARED_INST', 'expression', 'm_MISSING')
    expect(el).not.toBeNull()
    expect(['EXP_ONE', 'EXP_TWO']).toContain(el?.attributes?.NAME)
  })
})
