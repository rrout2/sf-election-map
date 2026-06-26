import { useState, useEffect, type ReactNode } from 'react'

const HASH = 'b96fbd0ec1a5b983a84e828fc8c27427f5e6591c05ad94ffc3cc43570d989b8c'
const STORAGE_KEY = 'sfem_auth'

interface PasswordGateProps {
  children: ReactNode
}

function hashPass(pass: string): Promise<string> {
  const enc = new TextEncoder()
  return crypto.subtle.digest('SHA-256', enc.encode(pass)).then((buf) => {
    const hex: string[] = []
    new Uint8Array(buf).forEach((b) => hex.push(b.toString(16).padStart(2, '0')))
    return hex.join('')
  })
}

export default function PasswordGate({ children }: PasswordGateProps) {
  const [authed, setAuthed] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const { h, t } = JSON.parse(stored)
        if (Date.now() - t < 3600000 && h === HASH) {
          setAuthed(true)
        }
      } catch {
        // ignore corrupt storage
      }
    }
    setLoading(false)
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(false)
    hashPass(value).then((h) => {
      if (h === HASH) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ h, t: Date.now() }))
        setAuthed(true)
      } else {
        setError(true)
      }
    })
  }

  if (loading) return null
  if (authed) return <>{children}</>

  return (
    <div className="password-gate">
      <form onSubmit={handleSubmit}>
        <h1>SF Election Map</h1>
        <p>This site is password protected.</p>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter password"
          autoFocus
        />
        {error && <p className="pass-error">Incorrect password</p>}
        <button type="submit">Enter</button>
      </form>
    </div>
  )
}
