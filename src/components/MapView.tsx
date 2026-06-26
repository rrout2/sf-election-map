import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import type { GeographyType, FeatureCollection } from '../types'

const SF_CENTER: [number, number] = [-122.4194, 37.7749]
const SF_BOUNDS: [[number, number], [number, number]] = [
  [-122.55, 37.68],
  [-122.33, 37.83],
]

const SOURCE_ID = 'election-data'
const FILL_LAYER = 'election-fill'
const LINE_LAYER = 'election-line'

function buildGeoData(
  geographyType: GeographyType,
  precinctAverages: Map<string, number>,
  regionAverages: Map<string, number>,
  precinctGeo?: FeatureCollection,
  supeGeo?: FeatureCollection,
  assemblyGeo?: FeatureCollection,
  bartGeo?: FeatureCollection,
): FeatureCollection {
  const baseGeo = {
    precincts: precinctGeo,
    supervisor: supeGeo,
    assembly: assemblyGeo,
    bart: bartGeo,
  }[geographyType]

  if (!baseGeo) return { type: 'FeatureCollection', features: [] }

  const idKey: Record<GeographyType, string> = {
    precincts: 'prec_2022',
    supervisor: 'sup_dist',
    assembly: 'assemb22',
    bart: 'bart22',
  }

  return {
    type: 'FeatureCollection',
    features: baseGeo.features.map((f) => {
      const id = String(f.properties?.[idKey[geographyType]] ?? f.properties?.name ?? f.id ?? '')
      const avg = geographyType === 'precincts'
        ? precinctAverages.get(id)
        : regionAverages.get(id)
      return {
        ...f,
        properties: {
          ...f.properties,
          name: f.properties?.name ?? id,
          avgYes: avg ?? -1,
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
  precinctAverages: Map<string, number>
  regionAverages: Map<string, number>
  selectedMeasures: string[]
}

export default function MapView({
  geographyType,
  precinctGeo,
  supeGeo,
  assemblyGeo,
  bartGeo,
  precinctAverages,
  regionAverages,
  selectedMeasures,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)

  const geoDataRef = useRef<FeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  })
  geoDataRef.current = buildGeoData(
    geographyType, precinctAverages, regionAverages,
    precinctGeo, supeGeo, assemblyGeo, bartGeo,
  )

  const selectedMeasuresRef = useRef(selectedMeasures)
  selectedMeasuresRef.current = selectedMeasures

  const geographyTypeRef = useRef(geographyType)
  geographyTypeRef.current = geographyType

  useEffect(() => {
    if (mapRef.current) return

    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN as string

    const map = new mapboxgl.Map({
      container: mapContainer.current!,
      style: 'mapbox://styles/mapbox/light-v11',
      center: SF_CENTER,
      zoom: 10.5,
      maxBounds: SF_BOUNDS,
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
    map.addControl(new mapboxgl.ScaleControl())

    map.on('load', () => {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: geoDataRef.current as unknown as Record<string, unknown>,
      })

      map.addLayer({
        id: FILL_LAYER,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': [
            'case',
            ['>', ['coalesce', ['get', 'avgYes'], -1], -0.5],
            [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', 'avgYes'], 0],
              25, '#b42d2d',
              35, '#ff7850',
              45, '#ffb464',
              55, '#ffe18c',
              65, '#8ca54b',
              75, '#3ca54b',
              85, '#16782d',
            ],
            'rgba(200,200,200,0.3)',
          ],
          'fill-opacity': 0.8,
        },
      })

      map.addLayer({
        id: LINE_LAYER,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': '#666',
          'line-width': geographyTypeRef.current === 'precincts' ? 0.3 : 1,
          'line-opacity': 0.5,
        },
      })

      let popup: mapboxgl.Popup | null = null

      map.on('mousemove', FILL_LAYER, (e) => {
        map.getCanvas().style.cursor = e.features && e.features.length > 0 ? 'pointer' : ''

        if (!e.features || e.features.length === 0) {
          popup?.remove()
          popup = null
          return
        }

        const feat = e.features[0]
        const props = (feat as unknown as Record<string, unknown>).properties as Record<string, unknown> | undefined
        const name = (props?.name as string) ?? 'Unknown'
        const avg = (props?.avgYes as number) ?? -1
        const pctStr = avg >= 0 ? `${Math.round(avg)}%` : 'No data'

        if (popup) {
          popup.setLngLat(e.lngLat).setHTML(
            `<h4>${name}</h4><p>Avg yes: ${pctStr}</p><p>(${selectedMeasuresRef.current.length} measures)</p>`,
          )
        } else {
          popup = new mapboxgl.Popup({ closeButton: false })
            .setLngLat(e.lngLat)
            .setHTML(`<h4>${name}</h4><p>Avg yes: ${pctStr}</p><p>(${selectedMeasuresRef.current.length} measures)</p>`)
            .addTo(map)
        }
      })

      map.on('mouseleave', FILL_LAYER, () => {
        map.getCanvas().style.cursor = ''
        popup?.remove()
        popup = null
      })
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    const src = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined
    if (src) {
      src.setData(geoDataRef.current as unknown as Parameters<mapboxgl.GeoJSONSource['setData']>[0])
    }

    map.setPaintProperty(LINE_LAYER, 'line-width', geographyType === 'precincts' ? 0.3 : 1)
  }, [geographyType, precinctAverages, regionAverages, selectedMeasures])

  return (
    <div ref={mapContainer} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />
  )
}
