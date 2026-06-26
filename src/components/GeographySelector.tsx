import type { GeographyType } from '../types'

interface GeographySelectorProps {
  value: GeographyType
  onChange: (v: GeographyType) => void
}

const OPTIONS: { value: GeographyType; label: string }[] = [
  { value: 'precincts', label: 'Precincts' },
  { value: 'supervisor', label: 'Supervisor Districts' },
  { value: 'assembly', label: 'Assembly Districts' },
  { value: 'bart', label: 'BART Districts' },
  { value: 'citywide', label: 'Citywide' },
]

export default function GeographySelector({ value, onChange }: GeographySelectorProps) {
  return (
    <div className="geography-selector">
      <h2>Geography</h2>
      <div className="geo-options">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`geo-btn ${value === opt.value ? 'active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
