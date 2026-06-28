import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import type { GeographyType, FeatureCollection, Measure } from '../types'

const SF_CENTER: [number, number] = [-122.4194, 37.7749]

const SOURCE_ID = 'election-data'
const FILL_LAYER = 'election-fill'
const LINE_LAYER = 'election-line'

function buildGeoData(
  geographyType: GeographyType,
  precinctAverages: Map<string, number>,
  regionAverages: Map<string, number>,
  regionVoteStats: Map<string, { avgVotes: number; maxVotes: number; maxMeasureId: string }>,
  precinctVoteStats: Map<string, { avgVotes: number; maxVotes: number; maxMeasureId: string }>,
  precinctGeo?: FeatureCollection,
  supeGeo?: FeatureCollection,
  assemblyGeo?: FeatureCollection,
  bartGeo?: FeatureCollection,
  citywideGeo?: FeatureCollection,
): FeatureCollection {
  const baseGeo = {
    precincts: precinctGeo,
    supervisor: supeGeo,
    assembly: assemblyGeo,
    bart: bartGeo,
    citywide: citywideGeo,
  }[geographyType]

  if (!baseGeo) return { type: 'FeatureCollection', features: [] }

  const idKey: Partial<Record<GeographyType, string>> = {
    precincts: 'prec_2022',
    supervisor: 'sup_dist',
    assembly: 'assemb22',
    bart: 'bart22',
  }

  return {
    type: 'FeatureCollection',
    features: baseGeo.features.map((f, i) => {
      const id = geographyType === 'citywide'
        ? String(f.id ?? 'SF')
        : String(f.properties?.[idKey[geographyType]!] ?? f.properties?.name ?? f.id ?? i)
      const avg = geographyType === 'precincts'
        ? precinctAverages.get(id)
        : regionAverages.get(id)
      const voteStats = geographyType === 'precincts'
        ? precinctVoteStats.get(id)
        : regionVoteStats.get(id)
      const label = geographyType === 'supervisor' ? `District ${id}`
        : geographyType === 'assembly' ? `AD ${id}`
        : geographyType === 'bart' ? `BART District ${id}`
        : geographyType === 'citywide' ? 'San Francisco'
        : f.properties?.name ?? id
      return {
        ...f,
        id,
        properties: {
          ...f.properties,
          name: label,
          avgYes: avg ?? -1,
          avgVotes: voteStats?.avgVotes ?? -1,
          maxVotes: voteStats?.maxVotes ?? -1,
          maxMeasureId: voteStats?.maxMeasureId ?? '',
        },
      } as FeatureCollection['features'][number]
    }),
  }
}

interface MapViewProps {
  geographyType: GeographyType
  precinctGeo?: FeatureCollection
  supeGeo?: FeatureCollection
  assemblyGeo?: FeatureCollection
  bartGeo?: FeatureCollection
  citywideGeo?: FeatureCollection
  precinctAverages: Map<string, number>
  regionAverages: Map<string, number>
  regionVoteStats: Map<string, { avgVotes: number; maxVotes: number; maxMeasureId: string }>
  precinctVoteStats: Map<string, { avgVotes: number; maxVotes: number; maxMeasureId: string }>
  measures: Measure[]
  selectedMeasures: string[]
  dark: boolean
}

export default function MapView({
  geographyType,
  precinctGeo,
  supeGeo,
  assemblyGeo,
  bartGeo,
  citywideGeo,
  precinctAverages,
  regionAverages,
  regionVoteStats,
  precinctVoteStats,
  measures,
  selectedMeasures,
  dark,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)

  const geoDataRef = useRef<FeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  })
  geoDataRef.current = buildGeoData(
    geographyType, precinctAverages, regionAverages, regionVoteStats, precinctVoteStats,
    precinctGeo, supeGeo, assemblyGeo, bartGeo, citywideGeo,
  )

  const selectedMeasuresRef = useRef(selectedMeasures)
  selectedMeasuresRef.current = selectedMeasures

  const geographyTypeRef = useRef(geographyType)
  geographyTypeRef.current = geographyType
  const setupLayersRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (mapRef.current) return

    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string

    const map = new mapboxgl.Map({
      container: mapContainer.current!,
      style: 'mapbox://styles/mapbox/light-v11',
      center: SF_CENTER,
      zoom: 10.5,
      minZoom: 8,
      maxZoom: 16,
      attributionControl: false,
      scrollZoom: true,
      dragRotate: true,
    })

    map.scrollZoom.enable()

    mapContainer.current?.addEventListener('wheel', (e) => {
      if (map.scrollZoom.isEnabled()) {
        e.preventDefault()
      }
    }, { passive: false })

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    function setupLayers() {
      if (map.getSource(SOURCE_ID)) return
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: geoDataRef.current as unknown as mapboxgl.GeoJSONSourceSpecification['data'],
      })

      map.addLayer({
        id: FILL_LAYER,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': [
            'case',
            ['>', ['coalesce', ['get', 'avgYes'], -1], 0],
            [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', 'avgYes'], 0],
              25, '#b42d2d',
              30, '#ff7850',
              40, '#ffb464',
              50, '#8db87a',
              60, '#4a9e6e',
              70, '#2d7d5a',
            ],
            'rgba(0,0,0,0)',
          ],
          'fill-opacity': 0.8,
          'fill-outline-color': [
            'case',
            ['==', ['feature-state', 'hover'], true],
            '#000',
            'rgba(0,0,0,0)',
          ],
        },
      })

      map.addLayer({
        id: LINE_LAYER,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': '#666',
          'line-width': geographyTypeRef.current === 'precincts' ? 0.3 : 1,
          'line-opacity': geographyTypeRef.current === 'citywide' ? 0 : 0.5,
        },
      })
    }

    map.on('load', setupLayers)
    setupLayersRef.current = setupLayers

    let popup: mapboxgl.Popup | null = null
    let hoveredId: string | number | undefined
    let pinned = false

    function popupHtml(name: string, pctStr: string, avgVotes: number, maxVotes: number, maxMeasureTitle: string) {
      return `<h4>${name}</h4>
<p>Average yes: ${pctStr} (${selectedMeasuresRef.current.length} measures)</p>
<p>Average votes: ${Math.round(avgVotes).toLocaleString()}</p>
<p>Highest votes: ${Math.round(maxVotes).toLocaleString()} (${maxMeasureTitle})</p>`
    }

    function showPopup(featId: string | number | undefined, lngLat: mapboxgl.LngLat, name: string, pctStr: string, avgVotes: number, maxVotes: number, maxMeasureTitle: string) {
      if (featId !== undefined && featId !== hoveredId) {
        if (hoveredId !== undefined) map.removeFeatureState({ source: SOURCE_ID, id: hoveredId })
        map.setFeatureState({ source: SOURCE_ID, id: featId }, { hover: true })
        hoveredId = featId
      }
      const html = popupHtml(name, pctStr, avgVotes, maxVotes, maxMeasureTitle)
      if (popup) {
        popup.setLngLat(lngLat).setHTML(html)
      } else {
        popup = new mapboxgl.Popup({ closeButton: false })
          .setLngLat(lngLat)
          .setHTML(html)
          .addTo(map)
      }
    }

    function clearHover() {
      if (hoveredId !== undefined) {
        map.removeFeatureState({ source: SOURCE_ID, id: hoveredId })
        hoveredId = undefined
      }
    }

    function popupContent(feat: Record<string, unknown>): { featId: string | number | undefined; name: string; pctStr: string; avgVotes: number; maxVotes: number; maxMeasureTitle: string } {
      const props = feat.properties as Record<string, unknown> | undefined
      const name = (props?.name as string) ?? 'Unknown'
      const avg = (props?.avgYes as number) ?? -1
      const pctStr = avg >= 0 ? `${Math.round(avg)}%` : 'No data'
      const avgVotes = (props?.avgVotes as number) ?? -1
      const maxVotes = (props?.maxVotes as number) ?? -1
      const maxMeasureId = (props?.maxMeasureId as string) ?? ''
      const maxMeasureTitle = selectedMeasuresRef.current.length > 0
        ? (measures.find((m) => m.id === maxMeasureId)?.title ?? maxMeasureId)
        : ''
      const featId = feat.id as string | number | undefined
      return { featId, name, pctStr, avgVotes, maxVotes, maxMeasureTitle }
    }

    map.on('click', (e) => {
      popup?.remove()
      popup = null
      clearHover()

      const features = e.point ? map.queryRenderedFeatures(e.point, { layers: [FILL_LAYER] }) : []
      if (features.length > 0) {
        const { featId, name, pctStr, avgVotes, maxVotes, maxMeasureTitle } = popupContent(features[0] as unknown as Record<string, unknown>)
        pinned = true
        showPopup(featId, e.lngLat, name, pctStr, avgVotes, maxVotes, maxMeasureTitle)
      } else {
        pinned = false
      }
    })

    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0

    if (!isTouch) {
      map.on('mousemove', FILL_LAYER, (e) => {
        map.getCanvas().style.cursor = e.features && e.features.length > 0 ? 'pointer' : ''

        if (!e.features || e.features.length === 0) {
          if (pinned) return
          popup?.remove()
          popup = null
          clearHover()
          return
        }

        if (pinned) return

        const { featId, name, pctStr, avgVotes, maxVotes, maxMeasureTitle } = popupContent(e.features[0] as unknown as Record<string, unknown>)
        showPopup(featId, e.lngLat, name, pctStr, avgVotes, maxVotes, maxMeasureTitle)
      })

      map.on('mouseleave', FILL_LAYER, () => {
        map.getCanvas().style.cursor = ''
        if (pinned) return
        popup?.remove()
        popup = null
        clearHover()
      })
    }

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  const darkRef = useRef(dark)
  darkRef.current = dark

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setStyle(`mapbox://styles/mapbox/${dark ? 'dark' : 'light'}-v11`)
    map.once('style.load', () => {
      setupLayersRef.current()
    })
  }, [dark])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    const src = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined
    if (src) {
      src.setData(geoDataRef.current as unknown as Parameters<mapboxgl.GeoJSONSource['setData']>[0])
    }

    map.setPaintProperty(LINE_LAYER, 'line-width', geographyType === 'precincts' ? 0.3 : 1)
    map.setPaintProperty(LINE_LAYER, 'line-opacity', geographyType === 'citywide' ? 0 : 0.5)
  }, [geographyType, precinctAverages, regionAverages, selectedMeasures])

  return (
    <div ref={mapContainer} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />
  )
}
