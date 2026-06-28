export interface Measure {
  id: string
  title: string
  election: string
  date: string
  description: string
  category: 'tax' | 'candidate' | 'other'
}

export interface PrecinctResult {
  precinct: string
  measureId: string
  yesVotes: number
  noVotes: number
  pctYes: number
}

export type GeographyType = 'precincts' | 'supervisor' | 'assembly' | 'bart' | 'citywide'

export interface FeatureCollection {
  type: 'FeatureCollection'
  features: Feature[]
}

export interface Feature {
  type: 'Feature'
  id: string
  properties: {
    name: string
    type: GeographyType
    [key: string]: unknown
  }
  geometry: {
    type: 'Polygon' | 'MultiPolygon'
    coordinates: number[][][]
  }
}

export interface RegionAvg {
  id: string
  name: string
  avgYes: number
  numMeasures: number
}
