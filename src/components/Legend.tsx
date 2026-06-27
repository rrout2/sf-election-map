interface LegendProps {
  numSelected: number
  geographyType: string
}

const STOPS = [
  { pct: '<30%', color: '#b42d2d' },
  { pct: '30-40%', color: '#ff7850' },
  { pct: '40-50%', color: '#ffb464' },
  { pct: '50-60%', color: '#8ca54b' },
  { pct: '60-70%', color: '#3ca54b' },
  { pct: '>70%', color: '#16782d' },
]

export default function Legend({ numSelected, geographyType }: LegendProps) {
  const geoLabel = geographyType === 'precincts' ? 'Precincts'
    : geographyType === 'neighborhoods' ? 'Neighborhoods'
    : geographyType === 'supervisor' ? 'Sup. Districts'
    : geographyType === 'assembly' ? 'Assembly Districts'
    : geographyType === 'bart' ? 'BART Districts'
    : 'Citywide'

  return (
    <div className="legend">
      <div className="legend-stats">
        <span>{numSelected} measures selected</span>
        <span>View: {geoLabel}</span>
      </div>
      <div className="legend-scale">
        {STOPS.map((s) => (
          <div key={s.pct} className="legend-item">
            <span className="legend-swatch" style={{ backgroundColor: s.color }} />
            <span className="legend-label">{s.pct}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
