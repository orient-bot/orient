'use client'

import { useState, useEffect } from 'react'

const statusMessages = [
  'SHIFTING...',
  'CMD-ING...',
  'OPT-ING...',
  'CTRL-ING...',
  'SPACING...',
  'BACKSPACING...',
  'ENTERING...',
  'THINKING...',
]

export default function ClaudeStatusIndicator() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [displayText, setDisplayText] = useState('')
  const [isTyping, setIsTyping] = useState(true)

  useEffect(() => {
    const message = statusMessages[currentIndex]
    let charIndex = 0

    // Reset for new message
    setDisplayText('')
    setIsTyping(true)

    // Typewriter effect
    const typeInterval = setInterval(() => {
      if (charIndex < message.length) {
        setDisplayText(message.slice(0, charIndex + 1))
        charIndex++
      } else {
        clearInterval(typeInterval)
        setIsTyping(false)
      }
    }, 60)

    // Move to next message after delay
    const nextMessageTimeout = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % statusMessages.length)
    }, 2500)

    return () => {
      clearInterval(typeInterval)
      clearTimeout(nextMessageTimeout)
    }
  }, [currentIndex])

  return (
    <div className="flex items-center gap-1.5 font-mono text-xs text-text-primary">
      <span className="text-text-muted">{'>'}</span>
      <span className="min-w-[100px]">{displayText}</span>
      <span className={`${isTyping ? 'opacity-100' : 'cursor-blink'}`}>▋</span>
    </div>
  )
}
