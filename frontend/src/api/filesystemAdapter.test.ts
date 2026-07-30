import { describe, expect, it } from 'vitest'
import { toFilesystem } from './filesystemAdapter'
import type { TreeNode } from './queries'

const tree: TreeNode = {
  name: 'xmltobq', path: '', kind: 'dir', layer: 'root',
  children: [
    {
      name: 'CDM', path: 'CDM', kind: 'dir', layer: 'CDM',
      children: [
        { name: 'm_A.xml', path: 'CDM/m_A.xml', kind: 'xml', layer: 'CDM', mappingPath: 'CDM/m_A', hasRecipe: true },
        {
          name: 'm_A', path: 'CDM/m_A', kind: 'outputDir', layer: 'CDM',
          children: [{ name: '_ETL_m_A.json', path: 'CDM/m_A/_ETL_m_A.json', kind: 'json', layer: 'CDM' }],
        },
      ],
    },
  ],
}

describe('toFilesystem', () => {
  it('maps dirs, xml and json files onto the Figma FSDir/FSFile shape', () => {
    const fs = toFilesystem(tree)
    expect(fs.name).toBe('xmltobq')
    expect(fs.layer).toBe('root')
    const cdm = fs.children[0] as { name: string; layer: string; children: unknown[] }
    expect(cdm.layer).toBe('CDM')
    expect(cdm.children).toEqual([
      { name: 'm_A.xml', path: 'CDM/m_A.xml', type: 'xml', mapping: 'CDM/m_A' },
      {
        name: 'm_A', layer: 'CDM',
        children: [{ name: '_ETL_m_A.json', path: 'CDM/m_A/_ETL_m_A.json', type: 'json', mapping: undefined }],
      },
    ])
  })
})
