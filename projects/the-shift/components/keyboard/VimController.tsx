'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import KeyboardVisualizer from './KeyboardVisualizer'

interface VimControllerProps {
  children: React.ReactNode
}

export default function VimController({ children }: VimControllerProps) {
  const router = useRouter()
  const [showHelp, setShowHelp] = useState(false)
  const [focusedSection, setFocusedSection] = useState(0)
  const sectionsRef = useRef<HTMLElement[]>([])

  useEffect(() => {
    sectionsRef.current = Array.from(document.querySelectorAll('section'))
  }, [])

  const scrollToSection = useCallback((index: number) => {
    const sections = sectionsRef.current
    if (sections[index]) {
      sections[index].scrollIntoView({ behavior: 'smooth', block: 'start' })
      setFocusedSection(index)
    }
  }, [])

  const handleVimCommand = useCallback((command: string) => {
    const sections = sectionsRef.current

    switch (command) {
      case 'down':
        if (focusedSection < sections.length - 1) {
          scrollToSection(focusedSection + 1)
        }
        break
      case 'up':
        if (focusedSection > 0) {
          scrollToSection(focusedSection - 1)
        }
        break
      case 'top':
        scrollToSection(0)
        break
      case 'bottom':
        scrollToSection(sections.length - 1)
        break
      case 'half-down':
        window.scrollBy({ top: window.innerHeight / 2, behavior: 'smooth' })
        break
      case 'half-up':
        window.scrollBy({ top: -window.innerHeight / 2, behavior: 'smooth' })
        break
      case 'invite':
        router.push('/invite')
        break
      case 'toggle-theme':
        const themeBtn = document.querySelector('[aria-label*="Switch to"]') as HTMLButtonElement
        if (themeBtn) themeBtn.click()
        break
      case 'help':
        setShowHelp(prev => !prev)
        break
      case 'escape':
        setShowHelp(false)
        break
    }
  }, [focusedSection, scrollToSection, router])

  return (
    <>
      {children}

      {/* Help Modal */}
      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg-primary/90 backdrop-blur-sm"
          onClick={() => setShowHelp(false)}
        >
          <div
            className="keyboard-container max-w-sm w-full mx-4 p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-text-primary font-mono">Shortcuts</h2>
              <button
                onClick={() => setShowHelp(false)}
                className="key key-interactive px-2 py-1 font-mono text-xs"
              >
                esc
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="key px-1.5 py-0.5 text-xs font-mono">j</span>
                <span className="text-text-secondary">next section</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="key px-1.5 py-0.5 text-xs font-mono">k</span>
                <span className="text-text-secondary">prev section</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="key px-1.5 py-0.5 text-xs font-mono">g</span>
                <span className="text-text-secondary">top</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="key px-1.5 py-0.5 text-xs font-mono">G</span>
                <span className="text-text-secondary">bottom</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="key px-1.5 py-0.5 text-xs font-mono">i</span>
                <span className="text-text-secondary">invite page</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="key px-1.5 py-0.5 text-xs font-mono">t</span>
                <span className="text-text-secondary">toggle theme</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="key px-1.5 py-0.5 text-xs font-mono">`</span>
                <span className="text-text-secondary">hide keyboard</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="key px-1.5 py-0.5 text-xs font-mono">?</span>
                <span className="text-text-secondary">this help</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <KeyboardVisualizer onVimCommand={handleVimCommand} />
    </>
  )
}
