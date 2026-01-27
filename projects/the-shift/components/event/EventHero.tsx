'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ShiftKey from '../keyboard/ShiftKey'
import ShootingStars from './ShootingStars'

export default function EventHero() {
  const [mounted, setMounted] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleShiftClick = () => {
    setTimeout(() => {
      router.push('/invite')
    }, 200)
  }

  return (
    <section className="relative overflow-hidden min-h-[80vh] flex flex-col items-center justify-center px-4 py-12">
      <ShootingStars />
      <div className="relative z-10 text-center max-w-4xl mx-auto">
        {/* The Shift key as hero */}
        <div className={`mb-12 ${mounted ? 'animate-scale-in' : 'opacity-0'}`}>
          <ShiftKey size="xl" pulsing onClick={handleShiftClick} />
        </div>

        <p className={`font-mono text-sm text-text-muted uppercase tracking-widest mb-6 ${mounted ? 'animate-fade-in animation-delay-200' : 'opacity-0'}`}>
          AI Builders Summit 2026
        </p>

        <h1 className={`text-4xl md:text-6xl font-bold mb-6 text-text-primary ${mounted ? 'animate-fade-in-up animation-delay-300' : 'opacity-0'}`}>
          Press <span className="font-mono">Shift</span> to change everything
        </h1>

        <p className={`text-lg md:text-xl text-text-secondary max-w-2xl mx-auto mb-4 ${mounted ? 'animate-fade-in-up animation-delay-400' : 'opacity-0'}`}>
          Software is being rewritten. Join 500 of Israel&apos;s top tech leaders
          for an exclusive, invite-only summit.
        </p>

        <p className={`text-sm text-text-muted ${mounted ? 'animate-fade-in animation-delay-500' : 'opacity-0'}`}>
          No recordings. No sponsors. Just content.
        </p>
      </div>

      {/* Vim hint */}
      <div className={`relative z-10 mt-16 flex items-center gap-3 ${mounted ? 'animate-fade-in animation-delay-500' : 'opacity-0'}`}>
        <div className="flex items-center gap-1">
          <span className="key key-small text-xs">j</span>
          <span className="key key-small text-xs">k</span>
        </div>
        <span className="text-text-muted text-sm font-mono">navigate</span>
        <span className="text-text-muted text-sm">•</span>
        <span className="key key-small text-xs">?</span>
        <span className="text-text-muted text-sm font-mono">help</span>
      </div>
    </section>
  )
}
