'use client'

import { useState, useCallback } from 'react'

const details = [
  {
    key: 'F1',
    label: 'DATE',
    value: 'Coming Soon',
    subtext: '3.5-4 hours',
  },
  {
    key: 'F2',
    label: 'LOCATION',
    value: 'Tel Aviv',
    subtext: 'Venue TBA',
  },
  {
    key: 'F3',
    label: 'ATTENDEES',
    value: '500',
    subtext: 'Invite only',
  },
]

export default function EventDetails() {
  const [pressedKey, setPressedKey] = useState<string | null>(null)

  const handleKeyPress = useCallback((key: string) => {
    setPressedKey(key)
    setTimeout(() => setPressedKey(null), 300)
  }, [])

  return (
    <section className="py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="keyboard-container">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {details.map((detail) => (
              <button
                key={detail.key}
                onClick={() => handleKeyPress(detail.key)}
                className={`
                  key key-interactive key-ripple
                  p-6 text-center relative text-left
                  ${pressedKey === detail.key ? 'key-animate ripple-active' : ''}
                `}
              >
                <span className="keycap-legend">{detail.key}</span>
                <p className="font-mono text-xs text-text-muted uppercase tracking-wider mb-2 mt-2">
                  {detail.label}
                </p>
                <p className="text-2xl font-bold text-text-primary mb-1">
                  {detail.value}
                </p>
                <p className="text-sm text-text-muted">
                  {detail.subtext}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
