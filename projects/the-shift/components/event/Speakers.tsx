'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Image from 'next/image'
import ModeIndicator from '../claude/ModeIndicator'

const speakers = [
  {
    key: 'Q',
    name: 'Shaul Amsterdamski',
    handle: '@amsterdamski2',
    role: 'Journalist (Host)',
    url: 'https://x.com/amsterdamski2',
    imageUrl: 'https://pbs.twimg.com/profile_images/759750089761882113/wiztyB6Y_400x400.jpg',
    isHost: true,
  },
  {
    key: 'W',
    name: 'Yosi Taguri',
    handle: '@yosit',
    role: 'Pizzaiolo',
    url: 'https://x.com/yosit',
    imageUrl: 'https://pbs.twimg.com/profile_images/1990193514022318081/73JkXeBv_400x400.jpg',
  },
  {
    key: 'E',
    name: 'Taltal',
    handle: '@taltimes2',
    role: 'Blogger',
    url: 'https://x.com/taltimes2',
    imageUrl: 'https://pbs.twimg.com/profile_images/2007759250450161664/uXiwXfET_400x400.jpg',
  },
  {
    key: 'R',
    name: 'Lee Moser',
    handle: 'LinkedIn',
    role: 'Managing Partner @ AnD Ventures',
    url: 'https://www.linkedin.com/in/lee-moser/',
    imageUrl: '/speakers/lee-moser.jpg',
    isLinkedIn: true,
  },
  {
    key: 'T',
    name: 'Nir Zohar',
    handle: '@nirzo',
    role: 'President @ Wix',
    url: 'https://x.com/nirzo',
    imageUrl: 'https://pbs.twimg.com/profile_images/1504186460018290696/wPnZTpMO_400x400.jpg',
  },
  {
    key: 'Y',
    name: 'Eytan Levit',
    handle: '@eytanlevit',
    role: 'Founder @ Mixtiles, Easyplant',
    url: 'https://x.com/eytanlevit',
    imageUrl: 'https://pbs.twimg.com/profile_images/1972200729688285184/AvHc6dA5_400x400.jpg',
  },
  {
    key: 'U',
    name: 'Arik Fraimovich',
    handle: '@arikfr',
    role: 'Creator of Redash, Databricks',
    url: 'https://x.com/arikfr',
    imageUrl: 'https://pbs.twimg.com/profile_images/622830842147115008/Yc8TzKpm_400x400.jpg',
  },
  {
    key: 'I',
    name: 'Alon Carmel',
    handle: '@aloncarmel',
    role: 'Founder @ Wilco',
    url: 'https://x.com/aloncarmel',
    imageUrl: 'https://pbs.twimg.com/profile_images/1439941107794825223/3kwmZyhl_400x400.jpg',
  },
  {
    key: 'O',
    name: 'Tal Bereznitskey',
    handle: '@ketacode',
    role: 'Co-Founder, CTO @torii_hq',
    url: 'https://x.com/ketacode',
    imageUrl: 'https://pbs.twimg.com/profile_images/1990166242590703616/m-pC1eE4_400x400.jpg',
  },
  {
    key: 'P',
    name: 'May Walter',
    handle: '@maywa1ter',
    role: 'Co-Founder & CTO @ Hud',
    url: 'https://x.com/maywa1ter',
    imageUrl: '/speakers/may-walter.jpg',
  },
  {
    key: 'A',
    name: 'Or Hiltch',
    handle: '@_orcaman',
    role: 'CTO @ Openwork AI',
    url: 'https://x.com/_orcaman',
    imageUrl: '/speakers/or-hiltch.jpg',
  },
  {
    key: 'S',
    name: 'Tal Barmeir',
    handle: 'LinkedIn',
    role: 'Co-founder & CEO @ Blinq.io',
    url: 'https://www.linkedin.com/in/talbarmeir/',
    imageUrl: '/speakers/tal-barmeir.jpg',
    isLinkedIn: true,
  },
]


export default function Speakers() {
  const [pressedKey, setPressedKey] = useState<string | null>(null)
  const [highlightIndex, setHighlightIndex] = useState<number>(0)
  const isPaused = useRef(false)

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isPaused.current) {
        setHighlightIndex((prev) => {
          let next: number
          do {
            next = Math.floor(Math.random() * speakers.length)
          } while (next === prev)
          return next
        })
      }
    }, 3500)
    return () => clearInterval(interval)
  }, [])

  const handleKeyPress = useCallback((key: string, url: string) => {
    setPressedKey(key)
    isPaused.current = true
    setTimeout(() => {
      setPressedKey(null)
      window.open(url, '_blank')
      setTimeout(() => {
        isPaused.current = false
      }, 1000)
    }, 200)
  }, [])

  return (
    <section className="py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-4">
            <ModeIndicator mode="ask" />
          </div>
          <h2 className="text-3xl font-bold mb-2 text-text-primary">Speakers</h2>
          <p className="text-text-secondary font-mono text-sm">
            // speakers.featured
          </p>
        </div>

        <div className="keyboard-container">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {speakers.map((speaker, index) => (
              <button
                key={speaker.key}
                onClick={() => handleKeyPress(speaker.key, speaker.url)}
                className={`
                  key key-interactive key-ripple key-backlight-transition
                  p-4 text-center relative group
                  ${pressedKey === speaker.key ? 'key-animate ripple-active' : ''}
                  ${highlightIndex === index && pressedKey !== speaker.key ? 'key-backlight' : ''}
                `}
              >
                <span className="keycap-legend">{speaker.key}</span>

                {/* Profile image as keyboard key */}
                <div
                  className={`
                    w-20 h-20 mx-auto mb-3 key key-interactive overflow-hidden
                    flex items-center justify-center
                    ${pressedKey === speaker.key ? 'key-animate' : ''}
                  `}
                >
                  {'imageUrl' in speaker && speaker.imageUrl ? (
                    <Image
                      src={speaker.imageUrl}
                      alt={speaker.name}
                      width={80}
                      height={80}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="text-2xl font-bold font-mono text-text-primary">
                      {speaker.name.split(' ').map(n => n[0]).join('')}
                    </span>
                  )}
                </div>

                <h3 className="font-semibold text-text-primary mb-1 text-sm">
                  {speaker.name}
                </h3>

                <p className="font-mono text-xs text-text-muted mb-1">
                  {speaker.handle}
                </p>

                <p className="text-xs text-text-secondary">
                  {speaker.role}
                </p>

                {/* Host badge */}
                {'isHost' in speaker && speaker.isHost && (
                  <span className="absolute top-2 left-2 bg-accent-primary text-[10px] px-1.5 py-0.5 rounded font-mono">
                    HOST
                  </span>
                )}

                {/* Social icon on hover */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {'isLinkedIn' in speaker && speaker.isLinkedIn ? (
                    <svg className="w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-text-muted text-sm font-mono mt-8">
          // click a key to visit their profile
        </p>
      </div>
    </section>
  )
}
