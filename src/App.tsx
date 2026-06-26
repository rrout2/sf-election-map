import { useState, useEffect, useMemo, useCallback } from 'react'
import type { GeographyType, FeatureCollection } from './types'
import { measures } from './data/measures'
import {
  generatePrecinctResults,
  type GeneratedResult,
} from './data/precinctResults'
import { calcRegionAverages, calcPrecinctAverages } from './utils/calculations'
import MapView from './components/MapView'
import MeasurePanel from './components/MeasurePanel'
import GeographySelector from './components/GeographySelector'
import Legend from './components/Legend'
import './App.css'
import PasswordGate from './components/PasswordGate'

export default function App() {
  const [geographyType, setGeographyType] = useState<GeographyType>('supervisor')
  const [selectedMeasures, setSelectedMeasures] = useState<string[]>(() =>
    measures.filter((m) => !m.id.includes('jackie')).map((m) => m.id),
  )
  const [precinctGeo, setPrecinctGeo] = useState<FeatureCollection>()
  const [supeGeo, setSupeGeo] = useState<FeatureCollection>()
  const [assemblyGeo, setAssemblyGeo] = useState<FeatureCollection>()
  const [bartGeo, setBartGeo] = useState<FeatureCollection>()
  const [citywideGeo, setCitywideGeo] = useState<FeatureCollection>()
  const [results, setResults] = useState<GeneratedResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')
  const [dark, setDark] = useState(prefersDark.matches)

  useEffect(() => {
    function onChange(e: MediaQueryListEvent) { setDark(e.matches) }
    prefersDark.addEventListener('change', onChange)
    return () => prefersDark.removeEventListener('change', onChange)
  }, [prefersDark])

  useEffect(() => {
    async function load() {
      try {
        const base = import.meta.env.BASE_URL
        const [precinctRes, supeRes, bartRes, assemblyRes, citywideRes] = await Promise.all([
          fetch(`${base}precincts.geojson`),
          fetch(`${base}supervisor-districts.geojson`),
          fetch(`${base}bart-districts.geojson`),
          fetch(`${base}assembly-districts.geojson`),
          fetch(`${base}citywide.geojson`),
        ])

        const [pGeo, sGeo, bGeo, aGeo, cwGeo] = await Promise.all([
          precinctRes.json() as Promise<FeatureCollection>,
          supeRes.json() as Promise<FeatureCollection>,
          bartRes.json() as Promise<FeatureCollection>,
          assemblyRes.json() as Promise<FeatureCollection>,
          citywideRes.json() as Promise<FeatureCollection>,
        ])

        setPrecinctGeo(pGeo)
        setSupeGeo(sGeo)
        setBartGeo(bGeo)
        setAssemblyGeo(aGeo)
        setCitywideGeo(cwGeo)
        setResults(generatePrecinctResults(pGeo))
        setLoading(false)
      } catch (err) {
        console.error('Failed to load geography data:', err)
        setError('Failed to load geography data. Make sure GeoJSON files are in the public folder.')
        setLoading(false)
      }
    }
    load()
  }, [])

  const precinctToRegion = useMemo(() => {
    if (!precinctGeo) return new Map<string, string>()
    const region = new Map<string, string>()
    for (const feat of precinctGeo.features) {
      const pid = String(feat.properties.prec_2022 ?? '')
      switch (geographyType) {
        case 'precincts':
          region.set(pid, pid)
          break
        case 'supervisor':
          region.set(pid, String(feat.properties.supe22 ?? ''))
          break
        case 'assembly':
          region.set(pid, String(feat.properties.assemb22 ?? ''))
          break
        case 'bart':
          region.set(pid, String(feat.properties.bart22 ?? ''))
          break
        case 'citywide':
          region.set(pid, 'SF')
          break
      }
    }
    return region
  }, [precinctGeo, geographyType])

  const regionNames = useMemo(() => {
    const names = new Map<string, string>()
    if (supeGeo) {
      for (const f of supeGeo.features) {
        const id = String(f.properties.sup_dist ?? f.properties.sup_dist_pad ?? '')
        const n = f.properties.sup_name
          ? `District ${id}: ${f.properties.sup_name}`
          : `District ${id}`
        names.set(id, n)
      }
    }
    if (assemblyGeo) {
      for (const f of assemblyGeo.features) {
        const id = String(f.properties.assemb22 ?? f.id ?? '')
        names.set(id, `AD ${id}`)
      }
    }
    if (bartGeo) {
      for (const f of bartGeo.features) {
        const id = String(f.properties.bart22 ?? '')
        names.set(id, `BART District ${id}`)
      }
    }
    names.set('SF', 'San Francisco')
    return names
  }, [supeGeo, assemblyGeo, bartGeo, citywideGeo])

  const regionAverages = useMemo(() => {
    if (results.length === 0 || selectedMeasures.length === 0) return new Map<string, number>()
    const avgs = calcRegionAverages(results, precinctToRegion, regionNames, selectedMeasures)
    const map = new Map<string, number>()
    for (const a of avgs) {
      map.set(a.id, a.avgYes)
    }
    return map
  }, [results, precinctToRegion, regionNames, selectedMeasures])

  const precinctAverages = useMemo(() => {
    if (results.length === 0 || selectedMeasures.length === 0) return new Map<string, number>()
    return calcPrecinctAverages(results, selectedMeasures)
  }, [results, selectedMeasures])

  const handleToggle = useCallback((id: string) => {
    setSelectedMeasures((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }, [])

  if (loading) {
    return <div className="app"><div className="loading">Loading geography data...</div></div>
  }

  if (error) {
    return <div className="app"><div className="loading error">{error}</div></div>
  }

  return (
    <PasswordGate>
    <div className={`app${dark ? ' dark' : ''}`}>
      <div className={`sidebar${sidebarOpen ? '' : ' sidebar--closed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-header-row">
            <h1>DSA SF Election Map</h1>
            <button className="dark-toggle" onClick={() => setDark((v) => !v)}>
              {dark ? '\u2600' : '\u263E'}
            </button>
          </div>
          <p>Average yes % for DSA-endorsed ballot measures</p>
        </div>
        <GeographySelector value={geographyType} onChange={setGeographyType} />
        <label className="jackie-toggle">
          <input
            type="checkbox"
            checked={selectedMeasures.some((id) => id.includes('jackie'))}
            onChange={() => {
              const jackieIds = measures.filter((m) => m.id.includes('jackie')).map((m) => m.id)
              setSelectedMeasures((prev) => {
                const hasAny = prev.some((id) => id.includes('jackie'))
                if (hasAny) {
                  return prev.filter((id) => !id.includes('jackie'))
                } else {
                  const set = new Set(prev)
                  for (const id of jackieIds) set.add(id)
                  return Array.from(set)
                }
              })
            }}
          />
          <span>Jackie Races (2020)</span>
        </label>
        <MeasurePanel
          measures={measures}
          selected={selectedMeasures}
          onToggle={handleToggle}
          onSelectAll={() => setSelectedMeasures(measures.map((m) => m.id))}
          onDeselectAll={() => setSelectedMeasures([])}
        />
      </div>
      <div className="map-container">
        <button className="sidebar-toggle" onClick={() => setSidebarOpen((v) => !v)}>
          {sidebarOpen ? '\u2715' : '\u2630'}
        </button>
        <MapView
          geographyType={geographyType}
          precinctGeo={precinctGeo}
          supeGeo={supeGeo}
          assemblyGeo={assemblyGeo}
          bartGeo={bartGeo}
          citywideGeo={citywideGeo}
          precinctAverages={precinctAverages}
          regionAverages={regionAverages}
          selectedMeasures={selectedMeasures}
          dark={dark}
        />
        <div className="legend-overlay">
          <Legend numSelected={selectedMeasures.length} geographyType={geographyType} />
        </div>
      </div>
    </div>
    </PasswordGate>
  )
}
