import type { GeneratedResult } from '../data/precinctResults'

export interface RegionAvg {
  id: string
  name: string
  avgYes: number
  numMeasures: number
  precinctCount: number
}

export function calcRegionAverages(
  results: GeneratedResult[],
  precinctToRegion: Map<string, string>,
  regionNames: Map<string, string>,
  selectedMeasures: string[],
): RegionAvg[] {
  const regionMap = new Map<string, { sum: number; count: number; precincts: Set<string> }>()

  const measureSet = new Set(selectedMeasures)

  for (const r of results) {
    if (!measureSet.has(r.measureId)) continue
    const regionId = precinctToRegion.get(r.precinct)
    if (regionId === undefined) continue

    let entry = regionMap.get(regionId)
    if (!entry) {
      entry = { sum: 0, count: 0, precincts: new Set() }
      regionMap.set(regionId, entry)
    }
    entry.sum += r.pctYes
    entry.count++
    entry.precincts.add(r.precinct)
  }

  const out: RegionAvg[] = []
  for (const [id, entry] of regionMap) {
    out.push({
      id,
      name: regionNames.get(id) ?? `District ${id}`,
      avgYes: entry.count > 0 ? entry.sum / entry.count : 0,
      numMeasures: selectedMeasures.length,
      precinctCount: entry.precincts.size,
    })
  }

  return out.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
}

export function calcPrecinctAverages(
  results: GeneratedResult[],
  selectedMeasures: string[],
): Map<string, number> {
  const precinctMap = new Map<string, { sum: number; count: number }>()
  const measureSet = new Set(selectedMeasures)

  for (const r of results) {
    if (!measureSet.has(r.measureId)) continue
    let entry = precinctMap.get(r.precinct)
    if (!entry) {
      entry = { sum: 0, count: 0 }
      precinctMap.set(r.precinct, entry)
    }
    entry.sum += r.pctYes
    entry.count++
  }

  const avgMap = new Map<string, number>()
  for (const [precinct, entry] of precinctMap) {
    avgMap.set(precinct, entry.count > 0 ? entry.sum / entry.count : 0)
  }
  return avgMap
}

export interface RegionVoteStats {
  avgVotes: number
  maxVotes: number
  maxMeasureId: string
}

export function calcRegionVoteStats(
  results: GeneratedResult[],
  precinctToRegion: Map<string, string>,
  selectedMeasures: string[],
): Map<string, RegionVoteStats> {
  const measureSet = new Set(selectedMeasures)

  // First pass: aggregate yesVotes per (region, measure)
  const regionMeasureTotals = new Map<string, Map<string, number>>()

  for (const r of results) {
    if (!measureSet.has(r.measureId)) continue
    const regionId = precinctToRegion.get(r.precinct)
    if (regionId === undefined) continue

    let measureMap = regionMeasureTotals.get(regionId)
    if (!measureMap) {
      measureMap = new Map()
      regionMeasureTotals.set(regionId, measureMap)
    }
    measureMap.set(r.measureId, (measureMap.get(r.measureId) ?? 0) + r.yesVotes)
  }

  // Second pass: compute avg and max from region-level totals
  const out = new Map<string, RegionVoteStats>()
  for (const [regionId, measureMap] of regionMeasureTotals) {
    let totalYes = 0
    let maxVotes = -Infinity
    let maxMeasureId = ''
    for (const [measureId, yesTotal] of measureMap) {
      totalYes += yesTotal
      if (yesTotal > maxVotes) {
        maxVotes = yesTotal
        maxMeasureId = measureId
      }
    }
    const numMeasures = measureMap.size
    out.set(regionId, {
      avgVotes: numMeasures > 0 ? totalYes / numMeasures : 0,
      maxVotes,
      maxMeasureId,
    })
  }
  return out
}

export function getPctColor(pct: number, opacity = 0.8): string {
  if (pct >= 75) return `rgba(22,120,45,${opacity})`
  if (pct >= 65) return `rgba(60,165,75,${opacity})`
  if (pct >= 55) return `rgba(140,210,100,${opacity})`
  if (pct >= 45) return `rgba(255,225,140,${opacity})`
  if (pct >= 35) return `rgba(255,180,100,${opacity})`
  if (pct >= 25) return `rgba(255,120,80,${opacity})`
  return `rgba(180,45,45,${opacity})`
}
