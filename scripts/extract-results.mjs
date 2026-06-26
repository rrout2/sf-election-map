import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import xlsx from 'xlsx'

const SCRIPT_DIR = new URL('.', import.meta.url).pathname
const TMP = '/tmp'

// ── election → measure mapping ────────────────────────────────────────────
const ELECTION_FILE = {
  '2018-06-05': { file: `${TMP}/sov_201806.tsv`, type: 'tsv' },
  '2018-11-06': { file: `${TMP}/sov_201811.tsv`, type: 'tsv' },
  '2020-03-03': { file: null, type: 'none' },
  '2020-11-03': { file: `${TMP}/psov_20201103.xlsx`, type: 'xlsx' },
  '2022-11-08': { file: `${TMP}/psov_20221108.xlsx`, type: 'xlsx' },
  '2024-11-05': { file: `${TMP}/psov_20241105.xlsx`, type: 'xlsx' },
}

const TSV_CONTESTS = {
  '2018-06-05': [
    { id: '2018-06-prop-c', contest: 'Local Measure C' },
    { id: '2018-06-prop-f', contest: 'Local Measure F' },
    { id: '2018-06-prop-g', contest: 'Local Measure G' },
  ],
  '2018-11-06': [
    { id: '2018-11-prop-c', contest: 'Local Measure C' },
  ],
}

const XLSX_SHEETS = {
  '2020-11-03': [
    { id: '2020-11-prop-i', sheet: 'Sheet39', type: 'measure' },
    { id: '2020-11-prop-k', sheet: 'Sheet41', type: 'measure' },
    { id: '2020-11-jackie-general', sheet: 'Sheet6', type: 'candidate', candidateCol: 8, totalCol: 10 },
  ],
  '2022-11-08': [
    { id: '2022-11-prop-h', sheet: 'Sheet61', type: 'measure' },
    { id: '2022-11-prop-m', sheet: 'Sheet65', type: 'measure' },
    { id: '2022-11-prop-o', sheet: 'Sheet67', type: 'measure' },
  ],
  '2024-11-05': [
    { id: '2024-11-prop-l', sheet: 'Sheet51', type: 'measure' },
  ],
}

// ── helpers ───────────────────────────────────────────────────────────────

function normalizePrecinct(raw) {
  let s = String(raw ?? '').trim()
  s = s.replace(/^PCT\s*/i, '')
  s = s.replace(/\s+/g, '')
  s = s.replace(/MB$/i, '')
  return s.toUpperCase()
}

function round2(n) {
  return Math.round(n * 100) / 100
}

// ── TSV parser ────────────────────────────────────────────────────────────

function parseTsv(filePath, electionDate, contestMap) {
  const text = readFileSync(filePath, 'utf-8')
  const lines = text.split('\n')
  const allResults = []

  for (const { id, contest } of contestMap) {
    let inSection = false
    let colMap = null
    const rawRows = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trimEnd()

      // Detect contest section start
      if (line.startsWith('***') && line.includes(contest)) {
        inSection = true
        colMap = null
        continue
      }

      if (!inSection) continue

      // Skip "Precinct Totals" line
      if (line === 'Precinct Totals' || line === 'Precinct Totals\r') continue

      // Column header line
      if (
        colMap == null &&
        (line.startsWith('PrecinctName') ||
         line.startsWith('PrecinctName\t'))
      ) {
        const cols = line.split('\t')
        colMap = {
          yesIdx: cols.indexOf('Yes'),
          noIdx: cols.indexOf('No'),
          precNameIdx: cols.indexOf('PrecinctName'),
          reportingTypeIdx: cols.indexOf('ReportingType'),
        }
        continue
      }

      // Data rows
      if (colMap && line.length > 0 && !line.startsWith('***') && !line.startsWith('DistrictName')) {
        const cols = line.split('\t')
        if (cols.length <= Math.max(colMap.yesIdx, colMap.noIdx, colMap.precNameIdx)) continue

        const reportingType = (cols[colMap.reportingTypeIdx] ?? '').trim()
        if (reportingType !== 'Election Day' && reportingType !== 'VBM') continue

        const rawPrecinct = cols[colMap.precNameIdx]
        const precinctId = normalizePrecinct(rawPrecinct)
        if (!precinctId) continue

        const yes = parseInt(cols[colMap.yesIdx] ?? '0', 10) || 0
        const no = parseInt(cols[colMap.noIdx] ?? '0', 10) || 0

        rawRows.push({ electionDate, precinctId, measureId: id, yes, no })
      }

      // Next contest
      if (line.startsWith('***') && !line.includes(contest)) {
        break
      }
    }

    // Aggregate Election Day + VBM per precinct
    const aggregated = aggregateTsv(rawRows, id)
    allResults.push(...aggregated)
  }

  return allResults
}

function aggregateTsv(rows, measureId) {
  const map = new Map()
  for (const r of rows) {
    if (r.measureId !== measureId) continue
    const key = r.precinctId
    if (!map.has(key)) {
      map.set(key, { precinctId: key, measureId, yes: 0, no: 0 })
    }
    const entry = map.get(key)
    entry.yes += r.yes
    entry.no += r.no
  }
  return Array.from(map.values())
}

// ── XLSX parser ───────────────────────────────────────────────────────────

function parseXlsxMeasures(filePath, electionDate, sheetDefs) {
  const wb = xlsx.readFile(filePath)
  const results = []

  for (const def of sheetDefs) {
    const ws = wb.Sheets[def.sheet]
    if (!ws) {
      console.warn(`  WARN: Sheet ${def.sheet} not found in ${filePath}`)
      continue
    }
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' })
    results.push(...parseXlsxSheet(rows, electionDate, def))
  }

  return results
}

function parseXlsxSheet(rows, electionDate, def) {
  const results = []

  // Find the header row (contains "Precinct" in col 0)
  let headerIdx = -1
  for (let r = 0; r < rows.length; r++) {
    const val = (rows[r][0] ?? '').toString().trim()
    if (val === 'Precinct') {
      headerIdx = r
      break
    }
  }
  if (headerIdx === -1) return results

  // Detect format: look at first data row after Countywide/Electionwide
  let firstDataRow = -1
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    const col0 = (row[0] ?? '').toString().trim()
    if (col0 !== 'Countywide' && col0 !== 'Electionwide' && col0.length > 0) {
      firstDataRow = r
      break
    }
  }
  if (firstDataRow === -1) return results

  // Check if next row after first data row says "Election Day" (multi-row format)
  const nextRow = rows[firstDataRow + 1]
  const nextCol0 = nextRow ? (nextRow[0] ?? '').toString().trim() : ''
  const isMultiRow = nextCol0 === 'Election Day'

  // Process data rows after header
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    const col0 = (row[0] ?? '').toString().trim()

    // Skip aggregate rows
    if (col0 === 'Countywide' || col0 === 'Electionwide') continue

    // Check if this is a precinct header row (starts with "PCT" or similar)
    if (/^(PCT\s+\d|PCT\s+\d+\/)/i.test(col0)) {
      const precinctId = normalizePrecinct(col0)
      if (!precinctId) continue

      if (isMultiRow) {
        // Multi-row format: Precinct, Election Day, VBM, Total
        const totalRow = rows[r + 3] ?? []
        if (def.type === 'candidate') {
          const candVotes = parseInt(totalRow[def.candidateCol] ?? '0', 10) || 0
          const totalVotes = parseInt(totalRow[def.totalCol] ?? '0', 10) || 0
          const yes = candVotes
          const no = totalVotes - candVotes
          const pctYes = totalVotes > 0 ? round2((candVotes / totalVotes) * 100) : 0
          results.push({ precinctId, measureId: def.id, electionDate, yes, no, pctYes })
        } else {
          const yes = parseInt(totalRow[6] ?? '0', 10) || 0
          const no = parseInt(totalRow[8] ?? '0', 10) || 0
          const total = parseInt(totalRow[10] ?? '0', 10) || 0
          const pctYes = total > 0 ? round2((yes / total) * 100) : 0
          results.push({ precinctId, measureId: def.id, electionDate, yes, no, pctYes })
        }
        r += 3
      } else {
        // Single-row format: each row has totals directly
        if (def.type === 'candidate') {
          const candVotes = parseInt(row[def.candidateCol] ?? '0', 10) || 0
          const totalVotes = parseInt(row[def.totalCol] ?? '0', 10) || 0
          const yes = candVotes
          const no = totalVotes - candVotes
          const pctYes = totalVotes > 0 ? round2((candVotes / totalVotes) * 100) : 0
          results.push({ precinctId, measureId: def.id, electionDate, yes, no, pctYes })
        } else {
          const yes = parseInt(row[6] ?? '0', 10) || 0
          const no = parseInt(row[8] ?? '0', 10) || 0
          const total = parseInt(row[10] ?? '0', 10) || 0
          const pctYes = total > 0 ? round2((yes / total) * 100) : 0
          results.push({ precinctId, measureId: def.id, electionDate, yes, no, pctYes })
        }
      }
    }
  }

  return results
}

// ── main ──────────────────────────────────────────────────────────────────

function main() {
  const allResults = []

  for (const [electionDate, info] of Object.entries(ELECTION_FILE)) {
    console.log(`\nProcessing ${electionDate}...`)

    if (info.type === 'tsv') {
      const contestMap = TSV_CONTESTS[electionDate]
      if (!contestMap) { console.log('  Skipping (no measures)'); continue }
      const rows = parseTsv(info.file, electionDate, contestMap)
      for (const r of rows) {
        const total = r.yes + r.no
        allResults.push({
          precinct: r.precinctId,
          measureId: r.measureId,
          yesVotes: r.yes,
          noVotes: r.no,
          pctYes: total > 0 ? round2((r.yes / total) * 100) : 0,
        })
      }
      console.log(`  Extracted ${rows.length} precinct-rows`)

    } else if (info.type === 'xlsx') {
      const sheetDefs = XLSX_SHEETS[electionDate]
      if (!sheetDefs) { console.log('  Skipping (no measures)'); continue }
      const rows = parseXlsxMeasures(info.file, electionDate, sheetDefs)
      for (const r of rows) {
        allResults.push({
          precinct: r.precinctId,
          measureId: r.measureId,
          yesVotes: r.yes,
          noVotes: r.no,
          pctYes: r.pctYes,
        })
      }
      console.log(`  Extracted ${rows.length} precinct-rows`)

    } else if (info.type === 'none') {
      console.log('  No data available. Will use proxy.')
    }
  }

  // Handle Mar 2020 Jackie primary with proxy allocation
  // Use Nov 2018 precinct registration as proxy for vote allocation
  console.log('\nAllocating Mar 2020 Jackie primary data...')
  const proxyReg = loadProxyRegistration()
  if (proxyReg.size > 0) {
    // Jackie's actual citywide totals from summary.xml
    // Scott Wiener: 154,001, Jackie: 92,141, Erin Smith: 29,285, Write-in: 0
    // Total: 275,427
    const JACKIE_TOTAL = 92141
    const TOTAL_VOTES = 275427
    const totalProxyReg = Array.from(proxyReg.values()).reduce((a, b) => a + b, 0)

    for (const [precinct, reg] of proxyReg) {
      const proportion = reg / totalProxyReg
      const jackieVotes = Math.round(JACKIE_TOTAL * proportion)
      const totalAllocated = Math.round(TOTAL_VOTES * proportion)
      const yesVotes = jackieVotes
      const noVotes = totalAllocated - jackieVotes
      allResults.push({
        precinct,
        measureId: '2020-03-jackie-primary',
        yesVotes,
        noVotes,
        pctYes: totalAllocated > 0 ? round2((jackieVotes / totalAllocated) * 100) : 0,
      })
    }
    console.log(`  Allocated to ${proxyReg.size} precincts via registration proxy`)
  }

  console.log(`\nTotal results: ${allResults.length}`)
  console.log(`Unique measures: ${[...new Set(allResults.map(r => r.measureId))].join(', ')}`)
  console.log(`Unique precincts: ${new Set(allResults.map(r => r.precinct)).size}`)

  // Write output
  const outPath = resolve(SCRIPT_DIR, '..', 'src', 'data', 'electionResults.json')
  writeFileSync(outPath, JSON.stringify(allResults, null, 2))
  console.log(`\nWritten to ${outPath}`)
}

function loadProxyRegistration() {
  const map = new Map()
  try {
    const text = readFileSync(`${TMP}/sov_201811.tsv`, 'utf-8')
    const lines = text.split('\n')
    // Find first contest to get registration per precinct
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('PrecinctName\t')) {
        const cols = lines[i].split('\t')
        const regIdx = cols.indexOf('Registration')
        const precNameIdx = cols.indexOf('PrecinctName')
        const reportingTypeIdx = cols.indexOf('ReportingType')
        if (regIdx === -1 || precNameIdx === -1) continue

        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].startsWith('***') || lines[j].startsWith('DistrictName')) break
          const parts = lines[j].split('\t')
          if (parts.length <= Math.max(regIdx, precNameIdx)) continue
          if ((parts[reportingTypeIdx] ?? '').trim() !== 'Election Day') continue
          const prec = normalizePrecinct(parts[precNameIdx])
          const reg = parseInt(parts[regIdx] ?? '0', 10) || 0
          if (prec && reg > 0 && !map.has(prec)) {
            map.set(prec, reg)
          }
        }
        break
      }
    }
  } catch (e) {
    console.warn('  WARN: Could not load proxy registration:', e.message)
  }
  return map
}

main()
