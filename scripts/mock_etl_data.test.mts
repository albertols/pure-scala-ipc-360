import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadManifest, renderMappingXml, l2lStatements, b15CasRows } from './mock_etl_data.mts'

const m = loadManifest()

test('manifest carries the full 12-mapping matrix over all 8 layers', () => {
  assert.equal(m.mappings.length, 12)
  assert.deepEqual([...new Set(m.mappings.map(x => x.layer))].sort(),
    ['CDM', 'DWH', 'ETL', 'ODS', 'OUTPUT', 'QDM', 'RDM', 'STG'])
  assert.equal(m.dates.length, 14)
  assert.equal(m.dates.at(-1), '2026-07-29')
})

test('xml rendering is deterministic and template-idiomatic', () => {
  const map3 = m.mappings.find(x => x.name === 'm_CAS_ODS_EVENTS')!
  const xml = renderMappingXml(m, map3)
  assert.equal(xml, renderMappingXml(m, map3))                        // byte-stable
  assert.match(xml, /CREATION_DATE="01\/07\/2026 00:00:00"/)          // manifest clock, not Date.now
  assert.match(xml, /TABLEATTRIBUTE NAME="Lookup table name" VALUE="CAS_LKP_STATUS"/)
  assert.match(xml, /<MAPPING [^>]*NAME="m_CAS_ODS_EVENTS"/)
  const split = renderMappingXml(m, m.mappings.find(x => x.name === 'm_CAS_ETL_EVENTS_SPLIT')!)
  assert.equal((split.match(/<TARGET /g) ?? []).length, 2)            // dual target
})

test('l2l rows: 14 total, two rows each for the multi-target mappings, parseable shape', () => {
  const all = ['STG','ODS','DWH','CDM','RDM','QDM','ETL','OUTPUT'].flatMap(l => l2lStatements(m, l))
  assert.equal(all.length, 14)
  assert.equal(all.filter(s => s.includes('_ETL_m_CAS_ETL_EVENTS_SPLIT.json')).length, 2)
  assert.equal(all.filter(s => s.includes('_ETL_m_CAS_CDM_EVENTS_MART.json')).length, 2)
  for (const s of all) assert.match(s, /^INSERT INTO CONTROL\.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES \('/)
})

test('b15 rows: 12 per date, KO pattern per manifest, anchor-date KO for #5', () => {
  for (const d of m.dates) assert.equal(b15CasRows(m, d).length, 12)
  const anchor = b15CasRows(m, '2026-07-29')
  const fact = anchor.find(r => r.includes('_ETL_m_CAS_DWH_EVENTS_FACT.json'))!
  assert.match(fact, /FAILED/)
  const incident = b15CasRows(m, '2026-07-21')
  assert.equal(incident.filter(r => r.includes('FAILED')).length, 12)  // all-KO incident day
  assert.equal(b15CasRows(m, '2026-07-16').join('\n'), b15CasRows(m, '2026-07-16').join('\n'))
})
