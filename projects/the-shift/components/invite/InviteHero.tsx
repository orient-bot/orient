'use client'

import Link from 'next/link'
import ShiftKey from '../keyboard/ShiftKey'

interface InviteHeroProps {
  kolName?: string
}

export default function InviteHero({ kolName }: InviteHeroProps) {
  return (
    <div className="text-center mb-8">
      <Link
        href="/event"
        className="inline-flex items-center gap-2 text-text-muted text-sm font-mono mb-8 hover:text-text-secondary transition-colors"
      >
        <span>←</span>
        <span>event details</span>
      </Link>

      <div className="mb-6">
        <ShiftKey size="lg" />
      </div>

      <h1 className="text-2xl font-bold mb-2 text-text-primary">
        Apply to attend
      </h1>

      <p className="text-text-secondary text-sm mb-2">
        AI Builders Summit 2025 — Tel Aviv
      </p>

      {kolName && (
        <p className="text-text-muted text-sm font-mono">
          // invited by {kolName}
        </p>
      )}
    </div>
  )
}
