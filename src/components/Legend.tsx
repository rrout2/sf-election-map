interface LegendProps {
  numSelected: number
  geographyType: string
}

const STOPS = [
  { pct: '<35%', color: '#b42d2d' },
  { pct: '35-45%', color: '#ff7850' },
  { pct: '45-55%', color: '#ffb464' },
  { pct: '55-65%', color: '#ffe18c' },
  { pct: '65-75%', color: '#8ca54b' },
  { pct: '75-85%', color: '#3ca54b' },
  { pct: '>85%', color: '#16782d' },
]

export default function Legend({ numSelected, geographyType }: LegendProps) {
  const geoLabel = geographyType === 'precincts' ? 'Precincts'
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
