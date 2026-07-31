// scripts/mock_etl_data.mts — run: node --experimental-strip-types scripts/mock_etl_data.mts --emit xml|l2l|b15 | --check
//
// Manifest-driven generator for the CAS relationship-casuistics mock family
// (docs/superpowers/specs/2026-07-31-operational-casuistics-design.md §3/§4).
// Pure functions render IPC Powermart XML, DWH_CONTROL L2L rows, and b15 job-history
// CSV rows deterministically from scripts/mock_etl_data.manifest.json — every byte
// comes from the manifest, never from Date.now()/Math.random(). Recipes are NOT
// rendered here: they come from the real Scala parser over a temp copy (make cas-gen,
// Task 2) — this script only produces the hand-off XML inputs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface CasField { name: string; srcType: string; precision: string; scale?: string }

export interface CasMapping {
  n: number
  name: string
  layer: string
  ext: 'xml' | 'XML'
  workflow: string
  order: number
  sources: { table: string; dbtype: 'Flat File' | 'Oracle'; fields: string[] }[]
  lookup: { table: string; inField: string; keyField: string; outField: string } | null
  targets: { table: string; writeMode: string; partition: string; partitionKey: string; fields: string[] }[]
  derived: { name: string; from: string[]; expr: string }
  b15: { cluster: string; baseSeconds: number; spreadSeconds: number; koDates: string[]; koMessage?: string }
}

export interface CasManifest {
  family: 'CAS'
  creationDate: string
  uuidBase: string
  dates: string[]
  incidentDate: string
  incidentMessage: string
  jobIdEpoch: number
  mappings: CasMapping[]
}

const LAYERS = ['STG', 'ODS', 'DWH', 'CDM', 'RDM', 'QDM', 'ETL', 'OUTPUT']
const L2L_BEGIN = '-- BEGIN mock_etl_data CAS (generated - do not hand-edit)'
const L2L_END = '-- END mock_etl_data CAS'
const B15_HEADER = 'cluster_name,recipe_filename,job_id,app_start_iso,avg_job_duration_in_mins_sec,status,message'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..')
const DEFAULT_MANIFEST_PATH = join(HERE, 'mock_etl_data.manifest.json')

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export function loadManifest(path: string = DEFAULT_MANIFEST_PATH): CasManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as CasManifest
}

/** "NAME:type:precision[.scale]" -> CasField */
function parseField(encoded: string): CasField {
  const [name, srcType, precScale] = encoded.split(':')
  const dot = precScale.indexOf('.')
  if (dot === -1) return { name, srcType, precision: precScale }
  return { name, srcType, precision: precScale.slice(0, dot), scale: precScale.slice(dot + 1) }
}

/** PowerCenter's internal TRANSFORMFIELD type vocabulary (distinct from SOURCEFIELD/TARGETFIELD's). */
function transformType(srcType: string): string {
  if (srcType === 'number') return 'decimal'
  if (srcType === 'date') return 'date/time'
  return 'string'
}

function fieldByName(fields: string[], name: string): CasField | undefined {
  const f = fields.map(parseField).find(x => x.name === name)
  return f
}

// ---------------------------------------------------------------------------
// XML renderer — mirrors parser/src/main/resources/xmltobq/STG/m_SYN_STG_L_ORDERS_LOAD.xml
// (simple), m_SYN_DWH_ORDERS_FACT.xml (multi-source), m_SYN_ETL_ORDERS_BRIDGE.xml
// (dual target), m_SYN_ODS_ORDERS.xml (lookup) byte-idiomatically.
// ---------------------------------------------------------------------------

type ExpPort = {
  name: string          // TRANSFORMFIELD NAME inside the EXP transformation (may be a renamed internal name)
  realName: string       // the SOURCE/TARGET field name this port ultimately represents
  spec: CasField
  portType: 'INPUT' | 'INPUT/OUTPUT' | 'OUTPUT'
  fromInstance: string
  fromInstanceType: 'Source Definition' | 'Lookup Procedure'
  expression?: string
}

function transformFieldLine(indent: string, port: ExpPort): string {
  const attrs = [
    `DATATYPE="${transformType(port.spec.srcType)}"`,
    `NAME="${port.name}"`,
    `PORTTYPE="${port.portType}"`,
    `PRECISION="${port.spec.precision}"`,
    `SCALE="${port.spec.scale ?? '0'}"`,
  ]
  if (port.expression) attrs.push(`EXPRESSION="${port.expression}"`)
  return `${indent}<TRANSFORMFIELD ${attrs.join(' ')}/>`
}

export function renderMappingXml(m: CasManifest, mp: CasMapping): string {
  const folderUuid = `${m.uuidBase}${String(mp.n).padStart(2, '0')}`
  const expName = `EXP_CAS_${mp.n}`
  const lkpName = `LKP_CAS_${mp.n}`
  const lines: string[] = []

  lines.push('<?xml version="1.0" encoding="Windows-1252"?>')
  lines.push(`<POWERMART CREATION_DATE="${m.creationDate}" REPOSITORY_VERSION="188.97">`)
  lines.push('  <REPOSITORY NAME="REP_SYN" VERSION="188" CODEPAGE="MS1252" DATABASETYPE="Oracle">')
  lines.push(`    <FOLDER NAME="CAS_EVENTS" GROUP="" OWNER="cas" SHARED="NOTSHARED" DESCRIPTION="CAS relationship casuistics family (sub-project 4)" PERMISSIONS="rwx------" UUID="${folderUuid}">`)

  // SOURCE blocks: one per manifest source, plus the lookup table's (metadata only — no
  // INSTANCE/CONNECTOR, exactly the SYN_LKP_CURRENCY idiom in m_SYN_ODS_ORDERS.xml).
  for (const src of mp.sources) {
    lines.push(`      <SOURCE DBDNAME="CASDB" DATABASETYPE="${src.dbtype}" NAME="${src.table}" OWNERNAME="CAS">`)
    src.fields.forEach((encoded, i) => {
      const f = parseField(encoded)
      lines.push(`        <SOURCEFIELD DATATYPE="${f.srcType}" NAME="${f.name}" FIELDNUMBER="${i + 1}" PRECISION="${f.precision}" SCALE="${f.scale ?? '0'}" NULLABLE="${i === 0 ? 'NOTNULL' : 'NULL'}"/>`)
    })
    lines.push('      </SOURCE>')
  }
  if (mp.lookup) {
    const inSpec = fieldByName(mp.sources.flatMap(s => s.fields), mp.lookup.inField)!
    const outSpec = fieldByName(mp.targets.flatMap(t => t.fields), mp.lookup.outField)!
    lines.push(`      <SOURCE DBDNAME="CASDB" DATABASETYPE="Oracle" NAME="${mp.lookup.table}" OWNERNAME="CAS">`)
    lines.push(`        <SOURCEFIELD DATATYPE="${inSpec.srcType}" NAME="${mp.lookup.keyField}" FIELDNUMBER="1" PRECISION="${inSpec.precision}" SCALE="${inSpec.scale ?? '0'}" NULLABLE="NOTNULL"/>`)
    lines.push(`        <SOURCEFIELD DATATYPE="${outSpec.srcType}" NAME="${mp.lookup.outField}" FIELDNUMBER="2" PRECISION="${outSpec.precision}" SCALE="${outSpec.scale ?? '0'}" NULLABLE="NULL"/>`)
    lines.push('      </SOURCE>')
  }

  // TARGET blocks
  for (const tgt of mp.targets) {
    lines.push(`      <TARGET DATABASETYPE="Oracle" NAME="${tgt.table}">`)
    tgt.fields.forEach((encoded, i) => {
      const f = parseField(encoded)
      lines.push(`        <TARGETFIELD DATATYPE="${f.srcType}" NAME="${f.name}" FIELDNUMBER="${i + 1}" PRECISION="${f.precision}" SCALE="${f.scale ?? '0'}" NULLABLE="${i === 0 ? 'NOTNULL' : 'NULL'}"/>`)
    })
    lines.push('      </TARGET>')
  }

  lines.push(`      <MAPPING DESCRIPTION="CAS casuistic mapping #${mp.n}" ISVALID="YES" NAME="${mp.name}" OBJECTVERSION="1" VERSIONNUMBER="1">`)

  // Lookup Procedure TRANSFORMATION (before Expression — m_SYN_ODS_ORDERS.xml order)
  if (mp.lookup) {
    const inSpec = fieldByName(mp.sources.flatMap(s => s.fields), mp.lookup.inField)!
    const outSpec = fieldByName(mp.targets.flatMap(t => t.fields), mp.lookup.outField)!
    lines.push(`        <TRANSFORMATION DESCRIPTION="" NAME="${lkpName}" OBJECTVERSION="1" REUSABLE="NO" TYPE="Lookup Procedure" VERSIONNUMBER="1">`)
    lines.push(`          <TRANSFORMFIELD DATATYPE="${transformType(inSpec.srcType)}" NAME="in_${mp.lookup.inField}" PORTTYPE="INPUT" PRECISION="${inSpec.precision}" SCALE="${inSpec.scale ?? '0'}"/>`)
    lines.push(`          <TRANSFORMFIELD DATATYPE="${transformType(inSpec.srcType)}" NAME="${mp.lookup.keyField}" PORTTYPE="LOOKUP" PRECISION="${inSpec.precision}" SCALE="${inSpec.scale ?? '0'}"/>`)
    lines.push(`          <TRANSFORMFIELD DATATYPE="${transformType(outSpec.srcType)}" NAME="${mp.lookup.outField}" PORTTYPE="LOOKUP/OUTPUT" PRECISION="${outSpec.precision}" SCALE="${outSpec.scale ?? '0'}"/>`)
    lines.push(`          <TABLEATTRIBUTE NAME="Lookup table name" VALUE="${mp.lookup.table}"/>`)
    lines.push(`          <TABLEATTRIBUTE NAME="Lookup condition" VALUE="${mp.lookup.keyField} = in_${mp.lookup.inField}"/>`)
    lines.push('          <TABLEATTRIBUTE NAME="Lookup policy on multiple match" VALUE="Use First Value"/>')
    lines.push('        </TRANSFORMATION>')
  }

  // Expression TRANSFORMATION port list: source fields (deduped by name, first source
  // wins — the m_SYN_DWH_ORDERS_FACT.xml multi-source idiom), needed only when the
  // field feeds the derived expression or reaches a target; the lookup's inField is
  // excluded (it routes to the Lookup Procedure instead, the CURRENCY_CODE idiom); the
  // lookup's outField is wired in as a plain passthrough port; the derived field is
  // always last and gets a collision-safe internal name when it shares its real name
  // with an INPUT port (the AMOUNT_CONVERTED->AMOUNT idiom: CONNECTOR TOFIELD is
  // independent of the EXP's internal port NAME).
  const targetFieldNames = new Set(mp.targets.flatMap(t => t.fields.map(f => parseField(f).name)))
  const needed = new Set([...mp.derived.from, ...targetFieldNames])
  const seen = new Set<string>()
  const ports: ExpPort[] = []
  for (const src of mp.sources) {
    for (const encoded of src.fields) {
      const f = parseField(encoded)
      if (mp.lookup && f.name === mp.lookup.inField) continue
      if (!needed.has(f.name) || seen.has(f.name)) continue
      seen.add(f.name)
      const portType: ExpPort['portType'] = mp.derived.from.includes(f.name) ? 'INPUT' : 'INPUT/OUTPUT'
      ports.push({ name: f.name, realName: f.name, spec: f, portType, fromInstance: src.table, fromInstanceType: 'Source Definition' })
    }
  }
  if (mp.lookup) {
    const outSpec = fieldByName(mp.targets.flatMap(t => t.fields), mp.lookup.outField)!
    ports.push({ name: mp.lookup.outField, realName: mp.lookup.outField, spec: outSpec, portType: 'INPUT/OUTPUT', fromInstance: lkpName, fromInstanceType: 'Lookup Procedure' })
  }
  const derivedSpec = fieldByName(mp.targets.flatMap(t => t.fields), mp.derived.name)!
  const derivedInternalName = seen.has(mp.derived.name) ? `${mp.derived.name}_CALC` : mp.derived.name
  ports.push({ name: derivedInternalName, realName: mp.derived.name, spec: derivedSpec, portType: 'OUTPUT', fromInstance: expName, fromInstanceType: 'Source Definition', expression: mp.derived.expr })

  lines.push(`        <TRANSFORMATION DESCRIPTION="" NAME="${expName}" OBJECTVERSION="1" REUSABLE="NO" TYPE="Expression" VERSIONNUMBER="1">`)
  for (const port of ports) lines.push(transformFieldLine('          ', port))
  lines.push('        </TRANSFORMATION>')

  // INSTANCEs
  for (const src of mp.sources) lines.push(`        <INSTANCE DESCRIPTION="" NAME="${src.table}" TRANSFORMATION_NAME="${src.table}" TRANSFORMATION_TYPE="Source Definition" TYPE="SOURCE"/>`)
  if (mp.lookup) lines.push(`        <INSTANCE DESCRIPTION="" NAME="${lkpName}" REUSABLE="NO" TRANSFORMATION_NAME="${lkpName}" TRANSFORMATION_TYPE="Lookup Procedure" TYPE="TRANSFORMATION"/>`)
  lines.push(`        <INSTANCE DESCRIPTION="" NAME="${expName}" REUSABLE="NO" TRANSFORMATION_NAME="${expName}" TRANSFORMATION_TYPE="Expression" TYPE="TRANSFORMATION"/>`)
  for (const tgt of mp.targets) lines.push(`        <INSTANCE DESCRIPTION="" NAME="${tgt.table}" TRANSFORMATION_NAME="${tgt.table}" TRANSFORMATION_TYPE="Target Definition" TYPE="TARGET"/>`)

  // CONNECTORs: source(non-lookup ports)->EXP, then source(inField)->LKP, LKP->EXP, then EXP->target(s)
  for (const port of ports) {
    if (port.portType === 'OUTPUT' || port.fromInstanceType === 'Lookup Procedure') continue
    lines.push(`        <CONNECTOR FROMINSTANCE="${port.fromInstance}" FROMINSTANCETYPE="${port.fromInstanceType}" FROMFIELD="${port.realName}" TOINSTANCE="${expName}" TOINSTANCETYPE="Expression" TOFIELD="${port.name}"/>`)
  }
  if (mp.lookup) {
    const inFieldSource = mp.sources.find(s => s.fields.some(f => parseField(f).name === mp.lookup!.inField))!
    lines.push(`        <CONNECTOR FROMINSTANCE="${inFieldSource.table}" FROMINSTANCETYPE="Source Definition" FROMFIELD="${mp.lookup.inField}" TOINSTANCE="${lkpName}" TOINSTANCETYPE="Lookup Procedure" TOFIELD="in_${mp.lookup.inField}"/>`)
    lines.push(`        <CONNECTOR FROMINSTANCE="${lkpName}" FROMINSTANCETYPE="Lookup Procedure" FROMFIELD="${mp.lookup.outField}" TOINSTANCE="${expName}" TOINSTANCETYPE="Expression" TOFIELD="${mp.lookup.outField}"/>`)
  }
  for (const port of ports) {
    if (port.portType === 'INPUT') continue
    for (const tgt of mp.targets) {
      if (!tgt.fields.some(f => parseField(f).name === port.realName)) continue
      lines.push(`        <CONNECTOR FROMINSTANCE="${expName}" FROMINSTANCETYPE="Expression" FROMFIELD="${port.name}" TOINSTANCE="${tgt.table}" TOINSTANCETYPE="Target Definition" TOFIELD="${port.realName}"/>`)
    }
  }

  mp.targets.forEach((t, i) => lines.push(`        <TARGETLOADORDER ORDER="${i + 1}" TARGETINSTANCE="${t.table}"/>`))
  lines.push('        <ERPINFO/>')
  lines.push('      </MAPPING>')
  lines.push('    </FOLDER>')
  lines.push('  </REPOSITORY>')
  lines.push('</POWERMART>')
  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// L2L (statements.sql) rows
// ---------------------------------------------------------------------------

function l2lRow(mp: CasMapping, table: string, order: number, writes: { table: string; writeMode: string }[],
                partitions: { table: string; partition: string; partitionKey: string }[]): string {
  const sources = mp.sources.map(s => `STRUCT('${s.table}', true, 0)`).join(', ')
  const lookups = mp.lookup ? `'${mp.lookup.table}'` : ''
  const wms = writes.map(w => `STRUCT('${w.table}', '${w.writeMode}')`).join(', ')
  const parts = partitions.map(p => `STRUCT('${p.table}', '${p.partition}', '${p.partitionKey}', 'UNKNOWN_SUBPARTITION')`).join(', ')
  return `INSERT INTO CONTROL.SCALAMATICA_LAYER_TO_LAYER_CONFIG VALUES ('${mp.layer}', 'src/main/resources/xmltobq/${mp.layer}', '_ETL_${mp.name}.json', '${mp.workflow}', '${table}', ${order}, [${sources}], [${lookups}], [${wms}], [${parts}])`
}

export function l2lStatements(m: CasManifest, layer: string): string[] {
  const rows: string[] = []
  for (const mp of m.mappings.filter(x => x.layer === layer).sort((a, b) => a.n - b.n)) {
    if (mp.targets.length === 1) {
      const t = mp.targets[0]
      rows.push(l2lRow(mp, t.table, mp.order, [{ table: t.table, writeMode: t.writeMode }], [{ table: t.table, partition: t.partition, partitionKey: t.partitionKey }]))
    } else {
      // multi-target: primary row lists ALL targets, one secondary row per extra target
      // lists only its own target — the m_SYN_ETL_ORDERS_BRIDGE.xml two-row idiom.
      rows.push(l2lRow(mp, mp.targets[0].table, mp.order,
        mp.targets.map(t => ({ table: t.table, writeMode: t.writeMode })),
        mp.targets.map(t => ({ table: t.table, partition: t.partition, partitionKey: t.partitionKey }))))
      for (const t of mp.targets.slice(1)) {
        rows.push(l2lRow(mp, t.table, mp.order, [{ table: t.table, writeMode: t.writeMode }], [{ table: t.table, partition: t.partition, partitionKey: t.partitionKey }]))
      }
    }
  }
  return rows
}

// ---------------------------------------------------------------------------
// b15 job-history CSV rows
// ---------------------------------------------------------------------------

export function b15CasRows(m: CasManifest, date: string): string[] {
  const dateIndex = m.dates.indexOf(date)
  return [...m.mappings].sort((a, b) => a.n - b.n).map(mp => {
    const n = mp.n
    const seconds = mp.b15.baseSeconds + ((n * 37 + dateIndex * 53) % mp.b15.spreadSeconds)
    const duration = `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}sec`
    const appStart = `${date}T${String(5 + (n % 6)).padStart(2, '0')}:${String((n * 7) % 60).padStart(2, '0')}:00.000Z`
    const jobId = `application_${m.jobIdEpoch}_${String(dateIndex).padStart(2, '0')}${String(n).padStart(3, '0')}`
    const isKoDate = mp.b15.koDates.includes(date)
    const isIncident = date === m.incidentDate
    const status = isKoDate || isIncident ? 'FAILED' : 'SUCCESS'
    const message = isKoDate ? (mp.b15.koMessage ?? m.incidentMessage) : isIncident ? m.incidentMessage : ''
    return `${mp.b15.cluster},_ETL_${mp.name}.json,${jobId},${appStart},${duration},${status},${message}`
  })
}

// ---------------------------------------------------------------------------
// Emitters (write to a root argument — never the real corpus/mock dirs directly;
// callers/CLI decide the root, corpus-safety per CLAUDE.md is the caller's job).
// ---------------------------------------------------------------------------

export function emitXml(m: CasManifest, corpusRoot: string): string[] {
  const written: string[] = []
  for (const mp of m.mappings) {
    const dir = join(corpusRoot, mp.layer)
    mkdirSync(dir, { recursive: true })
    const p = join(dir, `${mp.name}.${mp.ext}`)
    writeFileSync(p, renderMappingXml(m, mp))
    written.push(p)
  }
  return written
}

export function emitL2l(m: CasManifest, l2lRoot: string): string[] {
  const touched: string[] = []
  for (const layer of LAYERS) {
    const rows = l2lStatements(m, layer)
    if (rows.length === 0) continue
    const p = join(l2lRoot, layer, 'statements.sql')
    const existing = existsSync(p) ? readFileSync(p, 'utf8') : ''
    const block = `${L2L_BEGIN}\n${rows.join('\n')}\n${L2L_END}`
    const s = existing.indexOf(L2L_BEGIN)
    const e = existing.indexOf(L2L_END)
    let out: string
    if (s !== -1 && e !== -1) {
      out = existing.slice(0, s) + block + existing.slice(e + L2L_END.length)
    } else {
      const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n' : ''
      out = existing + sep + block + '\n'
    }
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, out)
    touched.push(p)
  }
  return touched
}

export function emitB15(m: CasManifest, inputsRoot: string): string[] {
  const touched: string[] = []
  for (const date of m.dates) {
    const p = join(inputsRoot, date.replace(/-/g, '_'), 'b15_application_end_with_recipe_null_status.csv')
    if (!existsSync(p)) continue
    const lines = readFileSync(p, 'utf8').split('\n')
    const header = lines[0] ?? B15_HEADER
    const kept = lines.slice(1).filter(l => l.trim().length > 0 && !l.split(',')[1]?.startsWith('_ETL_m_CAS_'))
    const out = [header, ...kept, ...b15CasRows(m, date)].join('\n') + '\n'
    writeFileSync(p, out)
    touched.push(p)
  }
  return touched
}

// ---------------------------------------------------------------------------
// --check: re-render every artifact in memory, byte-compare against disk, plus
// recipe existence. Never throws on missing files — reports drift instead.
// ---------------------------------------------------------------------------

function extractMarkerBlock(content: string): string | null {
  const s = content.indexOf(L2L_BEGIN)
  const e = content.indexOf(L2L_END)
  if (s === -1 || e === -1) return null
  return content.slice(s + L2L_BEGIN.length, e).trim()
}

export function checkAll(m: CasManifest, repoRoot: string): string[] {
  const drift: string[] = []
  const corpusRoot = join(repoRoot, 'parser/src/main/resources/xmltobq')
  const l2lRoot = join(repoRoot, 'backend/src/main/resources/mock/DWH_CONTROL/LAYER_TO_LAYER')
  const inputsRoot = join(repoRoot, 'backend/src/main/resources/mock/composer/dwh/config/cluster_tuning/inputs')

  for (const mp of m.mappings) {
    const xmlPath = join(corpusRoot, mp.layer, `${mp.name}.${mp.ext}`)
    if (!existsSync(xmlPath)) {
      drift.push(`missing XML: ${xmlPath}`)
    } else if (readFileSync(xmlPath, 'utf8') !== renderMappingXml(m, mp)) {
      drift.push(`XML drift: ${xmlPath}`)
    }
    const recipePath = join(corpusRoot, mp.layer, mp.name, `_ETL_${mp.name}.json`)
    if (!existsSync(recipePath)) drift.push(`missing recipe: ${recipePath}`)
  }

  for (const layer of LAYERS) {
    const expected = l2lStatements(m, layer)
    if (expected.length === 0) continue
    const p = join(l2lRoot, layer, 'statements.sql')
    if (!existsSync(p)) { drift.push(`missing L2L file: ${p}`); continue }
    const block = extractMarkerBlock(readFileSync(p, 'utf8'))
    if (block !== expected.join('\n')) drift.push(`L2L marker block drift: ${p}`)
  }

  for (const date of m.dates) {
    const p = join(inputsRoot, date.replace(/-/g, '_'), 'b15_application_end_with_recipe_null_status.csv')
    if (!existsSync(p)) { drift.push(`missing b15 CSV: ${p}`); continue }
    const lines = readFileSync(p, 'utf8').split('\n').filter(l => l.trim().length > 0)
    const casLines = lines.filter(l => l.split(',')[1]?.startsWith('_ETL_m_CAS_'))
    if (casLines.join('\n') !== b15CasRows(m, date).join('\n')) drift.push(`b15 CAS rows drift: ${p}`)
  }

  return drift
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2)
  const m = loadManifest()

  if (args.includes('--check')) {
    const drift = checkAll(m, REPO_ROOT)
    if (drift.length === 0) { console.log('mock_etl_data --check: clean'); process.exit(0) }
    for (const d of drift) console.error(`drift: ${d}`)
    console.error(`mock_etl_data --check: ${drift.length} drift item(s)`)
    process.exit(1)
  }

  const emitIdx = args.indexOf('--emit')
  const mode = emitIdx >= 0 ? args[emitIdx + 1] : undefined
  if (mode === 'xml') {
    const written = emitXml(m, join(REPO_ROOT, 'parser/src/main/resources/xmltobq'))
    console.log(`emitXml: wrote ${written.length} file(s)`)
  } else if (mode === 'l2l') {
    const touched = emitL2l(m, join(REPO_ROOT, 'backend/src/main/resources/mock/DWH_CONTROL/LAYER_TO_LAYER'))
    console.log(`emitL2l: touched ${touched.length} file(s)`)
  } else if (mode === 'b15') {
    const touched = emitB15(m, join(REPO_ROOT, 'backend/src/main/resources/mock/composer/dwh/config/cluster_tuning/inputs'))
    console.log(`emitB15: touched ${touched.length} file(s)`)
  } else {
    console.error('usage: mock_etl_data.mts --emit xml|l2l|b15 | --check')
    process.exit(1)
  }
}

if (process.argv[1]?.endsWith('mock_etl_data.mts')) {
  main()
}
