'use client'

import Link from 'next/link'
import ThemeToggle from '../ThemeToggle'

export default function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 p-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <Link href="/event" className="key px-4 py-2 font-mono text-sm font-semibold">
          The Shift
        </Link>

        <div className="flex items-center gap-2">
          <Link href="/invite" className="key px-4 py-2 font-mono text-xs">
            RSVP
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
