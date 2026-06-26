import type { FeatureCollection } from '../types'
import { measures } from './measures'
import electionResults from './electionResults.json'

export interface GeneratedResult {
  precinct: string
  measureId: string
  yesVotes: number
  noVotes: number
  pctYes: number
}

const supePoliticalFactor: Record<string, number> = {
  '1': 0.50, '2': 0.30, '3': 0.50, '4': 0.35, '5': 0.85,
  '6': 0.80, '7': 0.40, '8': 0.70, '9': 0.90, '10': 0.75, '11': 0.60,
}

const measureBaseline: Record<string, number> = {
  '2018-06-prop-c': 0.55,
  '2018-06-prop-f': 0.58,
  '2018-06-prop-g': 0.70,
  '2018-11-prop-c': 0.60,
  '2020-03-jackie-primary': 0.48,
  '2020-11-prop-i': 0.55,
  '2020-11-prop-k': 0.57,
  '2020-11-jackie-general': 0.46,
  '2022-11-prop-m': 0.55,
  '2022-11-prop-o': 0.65,
  '2022-11-prop-h': 0.54,
  '2024-11-prop-l': 0.60,
}

const measureSpread: Record<string, number> = {
  '2018-06-prop-c': 0.25,
  '2018-06-prop-f': 0.20,
  '2018-06-prop-g': 0.15,
  '2018-11-prop-c': 0.30,
  '2020-03-jackie-primary': 0.35,
  '2020-11-prop-i': 0.25,
  '2020-11-prop-k': 0.30,
  '2020-11-jackie-general': 0.35,
  '2022-11-prop-m': 0.25,
  '2022-11-prop-o': 0.15,
  '2022-11-prop-h': 0.20,
  '2024-11-prop-l': 0.25,
}

function hashSeed(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

function buildRealDataLookup(): Map<string, Map<string, GeneratedResult>> {
  const lookup = new Map<string, Map<string, GeneratedResult>>()

  for (const row of electionResults) {
    const { precinct, measureId, yesVotes, noVotes, pctYes } = row
    if (!lookup.has(measureId)) {
      lookup.set(measureId, new Map())
    }
    lookup.get(measureId)!.set(precinct, { precinct, measureId, yesVotes, noVotes, pctYes })
  }

  return lookup
}

export function generateMockResults(precinctGeo: FeatureCollection): GeneratedResult[] {
  const realLookup = buildRealDataLookup()
  const results: GeneratedResult[] = []

  for (const feat of precinctGeo.features) {
    const precinctId = String(feat.properties.prec_2022 ?? '')
    const supe = String(feat.properties.supe22 ?? '1')
    const factor = supePoliticalFactor[supe] ?? 0.5

    for (const m of measures) {
      const realMeasureData = realLookup.get(m.id)
      const realRow = realMeasureData?.get(precinctId)

      if (realRow) {
        results.push({
          precinct: precinctId,
          measureId: m.id,
          yesVotes: realRow.yesVotes,
          noVotes: realRow.noVotes,
          pctYes: realRow.pctYes,
        })
      } else {
        const baseline = measureBaseline[m.id] ?? 0.5
        const spread = measureSpread[m.id] ?? 0.2
        const seed = hashSeed(precinctId + '-' + m.id)
        const noise = ((seed % 101) - 50) / 500
        const pctYes = Math.max(0.05, Math.min(0.95, baseline + (factor - 0.5) * spread * 2 + noise))

        const total = 100 + (seed % 401)
        const yesVotes = Math.round(total * pctYes)
        const noVotes = total - yesVotes

        results.push({
          precinct: precinctId,
          measureId: m.id,
          yesVotes,
          noVotes,
          pctYes: Math.round(pctYes * 10000) / 100,
        })
      }
    }
  }

  return results
}

export function buildRegionLookup(precinctGeo: FeatureCollection): Map<string, string[]> {
  const lookup = new Map<string, string[]>()
  for (const feat of precinctGeo.features) {
    const precinctId = String(feat.properties.prec_2022 ?? '')
    const supe = String(feat.properties.supe22 ?? '')
    if (!lookup.has(supe)) lookup.set(supe, [])
    lookup.get(supe)!.push(precinctId)
  }
  return lookup
}

export function buildAssemblyLookup(precinctGeo: FeatureCollection): Map<string, string[]> {
  const lookup = new Map<string, string[]>()
  for (const feat of precinctGeo.features) {
    const precinctId = String(feat.properties.prec_2022 ?? '')
    const ad = String(feat.properties.assemb22 ?? '')
    if (!lookup.has(ad)) lookup.set(ad, [])
    lookup.get(ad)!.push(precinctId)
  }
  return lookup
}

export function buildBARTLookup(precinctGeo: FeatureCollection): Map<string, string[]> {
  const lookup = new Map<string, string[]>()
  for (const feat of precinctGeo.features) {
    const precinctId = String(feat.properties.prec_2022 ?? '')
    const bart = String(feat.properties.bart22 ?? '')
    if (!lookup.has(bart)) lookup.set(bart, [])
    lookup.get(bart)!.push(precinctId)
  }
  return lookup
}
