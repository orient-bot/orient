'use client'

import { useState, useEffect, useCallback } from 'react'
import ClaudeStatusIndicator from '../claude/ClaudeStatusIndicator'

// Only the keys we support
const supportedKeys = [
  { key: 'G', label: 'g', hint: 'top' },
  { key: 'J', label: 'j', hint: '↓' },
  { key: 'K', label: 'k', hint: '↑' },
  { key: 'I', label: 'i', hint: 'invite' },
  { key: 'T', label: 't', hint: 'theme' },
  { key: '?', label: '?', hint: 'help' },
]

interface KeyboardVisualizerProps {
  onVimCommand?: (command: string) => void
}

export default function KeyboardVisualizer({ onVimCommand }: KeyboardVisualizerProps) {
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set())
  const [isVisible, setIsVisible] = useState(true)
  const [lastAction, setLastAction] = useState<string | null>(null)

  const normalizeKey = useCallback((key: string): string => {
    return key.toUpperCase()
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      const key = normalizeKey(e.key)
      setPressedKeys(prev => new Set(prev).add(key))

      // Vim commands
      if (onVimCommand) {
        const k = e.key.toLowerCase()

        if (k === 'j') { onVimCommand('down'); setLastAction('↓ next') }
        if (k === 'k') { onVimCommand('up'); setLastAction('↑ prev') }
        if (k === 'h') { onVimCommand('left'); setLastAction('← left') }
        if (k === 'l') { onVimCommand('right'); setLastAction('→ right') }
        if (k === 'g' && e.shiftKey) { onVimCommand('bottom'); setLastAction('⤓ bottom') }
        if (k === 'g' && !e.shiftKey) { onVimCommand('top'); setLastAction('⤒ top') }
        if (k === 'd' && e.ctrlKey) { onVimCommand('half-down'); setLastAction('½↓') }
        if (k === 'u' && e.ctrlKey) { onVimCommand('half-up'); setLastAction('½↑') }
        if (k === 'i') { onVimCommand('invite'); setLastAction('→ invite') }
        if (k === 't') { onVimCommand('toggle-theme'); setLastAction('◐ theme') }
        if (k === '?' || (k === '/' && e.shiftKey)) { onVimCommand('help'); setLastAction('? help') }
        if (k === 'escape') { onVimCommand('escape'); setLastAction('esc') }
        if (k === '`') { setIsVisible(prev => !prev) }
      }

      // Clear action after delay
      setTimeout(() => setLastAction(null), 800)
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = normalizeKey(e.key)
      setPressedKeys(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [normalizeKey, onVimCommand])

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 key key-interactive px-2 py-1.5 font-mono text-xs z-50"
        title="Show keyboard (press `)"
      >
        ⌨
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 bg-bg-secondary/90 backdrop-blur-sm rounded-xl p-2 border border-border-key shadow-lg">
        {/* Keys */}
        <div className="flex items-center gap-1">
          {supportedKeys.map(({ key, label, hint }) => {
            const isPressed = pressedKeys.has(key) || pressedKeys.has(label.toUpperCase())

            return (
              <div
                key={key}
                className={`
                  key key-interactive
                  w-8 h-8 flex flex-col items-center justify-center
                  text-xs font-mono relative
                  transition-all duration-75
                  ${isPressed ? 'key-animate !bg-text-primary !text-bg-primary' : ''}
                `}
                title={hint}
              >
                <span className="font-bold">{label}</span>
              </div>
            )
          })}
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-border-key" />

        {/* Action indicator / Claude status */}
        <div className="min-w-[120px] text-center">
          {lastAction ? (
            <span className="font-mono text-xs text-text-primary animate-fade-in">{lastAction}</span>
          ) : (
            <ClaudeStatusIndicator />
          )}
        </div>

        {/* Close button */}
        <button
          onClick={() => setIsVisible(false)}
          className="key key-interactive w-6 h-6 flex items-center justify-center text-xs"
          title="Hide (press `)"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
