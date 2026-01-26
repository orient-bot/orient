'use client'

import { useState, useCallback } from 'react'

const agenda = [
  {
    key: '1',
    time: '10 min',
    title: 'Opening',
    description: 'Welcome and introduction',
    details: null,
  },
  {
    key: '2',
    time: '15 min',
    title: 'The Burden Bearers',
    description: 'AI for mature codebases — bringing AI to real production',
    sessions: '2 demos',
    details: {
      subtitle: 'When your codebase has history',
      points: [
        'Integrating AI into legacy systems without breaking everything',
        'Strategies for incremental AI adoption in enterprise environments',
      ],
      speakers: 'Industry practitioners who\'ve done the hard work',
    },
  },
  {
    key: '3',
    time: '15 min',
    title: 'The Vibe Coders',
    description: 'Solo builders & AI-native products — one person, team output',
    sessions: '2 demos',
    details: {
      subtitle: 'Building at 10x speed',
      points: [
        'How solo developers are shipping products that used to need teams',
        'From idea to production in days, not months',
      ],
      speakers: 'Indie hackers and solo founders breaking records',
    },
  },
  {
    key: '4',
    time: '15 min',
    title: 'Software 3.0',
    description: 'Agentic applications — when code stops being deterministic',
    sessions: '2 demos',
    details: {
      subtitle: 'The paradigm shift',
      points: [
        'Building applications where AI agents make decisions',
        'Safety, guardrails, and trust in agentic systems',
      ],
      speakers: 'Pioneers building the next generation of software',
    },
  },
  {
    key: '—',
    time: '10 min',
    title: 'Networking Break',
    description: null,
    details: null,
  },
  {
    key: '⇧',
    time: '30 min',
    title: 'The Great Rewrite',
    description: 'Panel discussion on the future of the industry',
    highlight: true,
    details: {
      subtitle: 'The big questions',
      points: [
        'Will AI replace developers or make them 100x more productive?',
        'What skills matter in the AI era?',
      ],
      speakers: 'Hosted by Shaul Amsterdamsky with industry leaders',
    },
  },
  {
    key: '5',
    time: '15 min',
    title: 'Closing & Networking',
    description: null,
    details: null,
  },
]

export default function EventAgenda() {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [pressedIndex, setPressedIndex] = useState<number | null>(null)

  const handleKeyPress = useCallback((index: number) => {
    setPressedIndex(index)
    setTimeout(() => setPressedIndex(null), 150)

    // Toggle expand if has details
    if (agenda[index].details) {
      setExpandedIndex(prev => prev === index ? null : index)
    }
  }, [])

  return (
    <section className="py-20 px-4 bg-bg-secondary">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-2 text-text-primary">Agenda</h2>
          <p className="text-text-secondary font-mono text-sm">
            // event.schedule
          </p>
        </div>

        <div className="space-y-3">
          {agenda.map((item, index) => {
            const isExpanded = expandedIndex === index
            const hasDetails = !!item.details

            return (
              <div key={index}>
                <button
                  onClick={() => handleKeyPress(index)}
                  className={`
                    key key-interactive key-ripple
                    w-full flex items-start gap-4 p-4 text-left
                    ${item.highlight ? 'ring-2 ring-text-primary' : ''}
                    ${pressedIndex === index ? 'key-animate ripple-active' : ''}
                    ${hasDetails ? 'cursor-pointer' : 'cursor-default'}
                  `}
                >
                  <div
                    className={`
                      key key-small flex-shrink-0 text-lg
                      ${item.key === '⇧' ? 'key-shift text-sm' : ''}
                    `}
                  >
                    {item.key}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3 mb-1">
                      <h3 className="font-semibold text-text-primary">{item.title}</h3>
                      <span className="font-mono text-xs text-text-muted">{item.time}</span>
                      {hasDetails && (
                        <span className={`text-text-muted text-xs transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                          ▼
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-sm text-text-secondary">{item.description}</p>
                    )}
                    {item.sessions && (
                      <p className="font-mono text-xs text-text-muted mt-1">{item.sessions}</p>
                    )}
                  </div>
                </button>

                {/* Expandable details */}
                {hasDetails && isExpanded && (
                  <div className="mt-1 ml-14 mr-4 p-4 bg-bg-key/50 rounded-lg border border-border-key animate-fade-in">
                    {item.details.subtitle && (
                      <p className="font-mono text-sm text-text-primary mb-3">
                        // {item.details.subtitle}
                      </p>
                    )}
                    <ul className="space-y-2 mb-3">
                      {item.details.points.map((point, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                          <span className="text-text-muted">→</span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                    {item.details.speakers && (
                      <p className="text-xs text-text-muted font-mono">
                        {item.details.speakers}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <p className="text-center text-text-muted text-xs font-mono mt-8">
          // click items to expand details
        </p>
      </div>
    </section>
  )
}
