'use client'

import { useState, useCallback } from 'react'

const speakers = [
  {
    key: 'Q',
    name: 'Tom Ben-Simhon',
    handle: '@ketacode',
    role: 'Founder & AI Engineer',
    xUrl: 'https://x.com/ketacode',
  },
  {
    key: 'W',
    name: 'Tal Weinfeld',
    handle: '@taltimes2',
    role: 'Tech Lead',
    xUrl: 'https://x.com/taltimes2',
  },
  {
    key: 'E',
    name: 'Yosi Taguri',
    handle: '@yosit',
    role: 'Entrepreneur',
    xUrl: 'https://x.com/yosit',
  },
]

export default function Speakers() {
  const [pressedKey, setPressedKey] = useState<string | null>(null)

  const handleKeyPress = useCallback((key: string, url: string) => {
    setPressedKey(key)
    setTimeout(() => {
      setPressedKey(null)
      window.open(url, '_blank')
    }, 200)
  }, [])

  return (
    <section className="py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-2 text-text-primary">Speakers</h2>
          <p className="text-text-secondary font-mono text-sm">
            // speakers.featured
          </p>
        </div>

        <div className="keyboard-container">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {speakers.map((speaker) => (
              <button
                key={speaker.key}
                onClick={() => handleKeyPress(speaker.key, speaker.xUrl)}
                className={`
                  key key-interactive key-ripple
                  p-6 text-center relative group
                  ${pressedKey === speaker.key ? 'key-animate ripple-active' : ''}
                `}
              >
                <span className="keycap-legend">{speaker.key}</span>

                {/* Avatar as keyboard key */}
                <div
                  className={`
                    w-16 h-16 mx-auto mb-4 key key-interactive
                    flex items-center justify-center text-2xl font-bold font-mono
                    ${pressedKey === speaker.key ? 'key-animate' : ''}
                  `}
                >
                  {speaker.name.charAt(0)}
                </div>

                <h3 className="font-semibold text-text-primary mb-1">
                  {speaker.name}
                </h3>

                <p className="font-mono text-sm text-text-muted mb-2">
                  {speaker.handle}
                </p>

                <p className="text-sm text-text-secondary">
                  {speaker.role}
                </p>

                {/* X icon on hover */}
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg className="w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-text-muted text-sm font-mono mt-8">
          // more speakers coming soon...
        </p>
      </div>
    </section>
  )
}
