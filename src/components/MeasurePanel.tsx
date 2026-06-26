import { type Measure } from '../types'

interface MeasurePanelProps {
  measures: Measure[]
  selected: string[]
  onToggle: (id: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
}

export default function MeasurePanel({ measures, selected, onToggle, onSelectAll, onDeselectAll }: MeasurePanelProps) {
  const grouped = new Map<string, Measure[]>()
  for (const m of measures) {
    const list = grouped.get(m.election) ?? []
    list.push(m)
    grouped.set(m.election, list)
  }

  const allSelected = selected.length === measures.length

  return (
    <div className="measure-panel">
      <div className="measure-panel-header">
        <h2>DSA SF Endorsed Measures</h2>
        <button className="select-all-btn" onClick={allSelected ? onDeselectAll : onSelectAll}>
          {allSelected ? 'Deselect All' : 'Select All'}
        </button>
      </div>
      <p className="hint">Toggle measures to include in average</p>
      {Array.from(grouped.entries()).map(([election, ms]) => (
        <div key={election} className="election-group">
          <h3>{election}</h3>
          {ms.map((m) => (
            <label key={m.id} className="measure-row">
              <input
                type="checkbox"
                checked={selected.includes(m.id)}
                onChange={() => onToggle(m.id)}
              />
              <span className="measure-title">{m.title}</span>
            </label>
          ))}
        </div>
      ))}
    </div>
  )
}
