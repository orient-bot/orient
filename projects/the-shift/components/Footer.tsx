'use client'

export default function Footer() {
  return (
    <footer className="py-8 px-4 border-t border-border-key bg-bg-secondary">
      <div className="max-w-4xl mx-auto text-center">
        <p className="font-mono text-sm text-text-muted flex items-center justify-center gap-2">
          <span className="text-text-secondary">⌨</span>
          <span>built with vibes and AI</span>
          <span className="cursor-blink">▋</span>
        </p>
        <p className="font-mono text-xs text-text-muted mt-2">
          ⇧ the-shift.dev
        </p>
      </div>
    </footer>
  )
}
