'use client'

import { useEffect, useRef } from 'react'

const CHARS = ['{', '}', '<', '>', '/', '*', '=', '#', ';', '(', ')', '[', ']', '&', '|', '!', '~', '%', '+', '=>', '::']
const MAX_STARS = 12
const TRAIL_LENGTH = 10

interface Star {
  char: string
  x: number
  y: number
  speed: number
  fontSize: number
  angle: number
  trail: { x: number; y: number }[]
  opacity: number
  phase: 'in' | 'travel' | 'out'
  life: number
  maxLife: number
}

function createStar(width: number, height: number): Star {
  const angle = (210 + Math.random() * 30) * (Math.PI / 180)
  const fontSize = 14 + Math.random() * 10
  return {
    char: CHARS[Math.floor(Math.random() * CHARS.length)],
    x: width * (0.3 + Math.random() * 0.7),
    y: -20 - Math.random() * 40,
    speed: 1.5 + Math.random() * 3,
    fontSize,
    angle,
    trail: [],
    opacity: 0,
    phase: 'in',
    life: 0,
    maxLife: 200 + Math.random() * 200,
  }
}

export default function ShootingStars() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) return

    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    let animId: number
    let spawnTimer: ReturnType<typeof setTimeout>
    const stars: Star[] = []
    let color = ''

    function readColor() {
      color = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#888'
    }
    readColor()

    const observer = new MutationObserver(() => readColor())
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

    function resize() {
      const dpr = window.devicePixelRatio || 1
      const rect = parent!.getBoundingClientRect()
      canvas!.width = rect.width * dpr
      canvas!.height = rect.height * dpr
      canvas!.style.width = `${rect.width}px`
      canvas!.style.height = `${rect.height}px`
      const ctx = canvas!.getContext('2d')
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const isDark = () => document.documentElement.classList.contains('dark')

    function spawnStar() {
      if (stars.length < MAX_STARS) {
        const rect = parent!.getBoundingClientRect()
        stars.push(createStar(rect.width, rect.height))
      }
      spawnTimer = setTimeout(spawnStar, 500 + Math.random() * 500)
    }
    spawnStar()

    function draw() {
      const ctx = canvas!.getContext('2d')
      if (!ctx) return
      const rect = parent!.getBoundingClientRect()
      ctx.clearRect(0, 0, rect.width, rect.height)

      const maxOpacity = isDark() ? 0.35 : 0.25

      for (let i = stars.length - 1; i >= 0; i--) {
        const s = stars[i]
        s.life++

        // movement
        s.x += Math.cos(s.angle) * s.speed
        s.y -= Math.sin(s.angle) * s.speed
        s.trail.push({ x: s.x, y: s.y })
        if (s.trail.length > TRAIL_LENGTH) s.trail.shift()

        // phase transitions
        if (s.phase === 'in') {
          s.opacity = Math.min(s.opacity + 0.02, maxOpacity)
          if (s.opacity >= maxOpacity) s.phase = 'travel'
        } else if (s.phase === 'travel' && s.life > s.maxLife * 0.7) {
          s.phase = 'out'
        } else if (s.phase === 'out') {
          s.opacity = Math.max(s.opacity - 0.015, 0)
        }

        // remove dead or off-screen stars
        if (s.opacity <= 0 && s.phase === 'out') { stars.splice(i, 1); continue }
        if (s.x < -50 || s.y > rect.height + 50) { stars.splice(i, 1); continue }

        // draw trail
        ctx.font = `${s.fontSize}px 'JetBrains Mono', monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        for (let t = 0; t < s.trail.length; t++) {
          const trailOpacity = s.opacity * ((t + 1) / s.trail.length) * 0.7
          ctx.fillStyle = `color-mix(in srgb, ${color} ${Math.round(trailOpacity * 100 / maxOpacity)}%, transparent)`
          ctx.globalAlpha = trailOpacity
          ctx.fillText(s.char, s.trail[t].x, s.trail[t].y)
        }

        // draw head
        ctx.globalAlpha = s.opacity
        ctx.fillStyle = color
        ctx.fillText(s.char, s.x, s.y)
      }

      ctx.globalAlpha = 1
      animId = requestAnimationFrame(draw)
    }

    // pause when tab hidden
    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(animId)
      } else {
        animId = requestAnimationFrame(draw)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    animId = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(animId)
      clearTimeout(spawnTimer)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
      observer.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
    />
  )
}
