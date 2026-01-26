'use client'

import { useRouter } from 'next/navigation'
import ShiftKey from '../keyboard/ShiftKey'
import ModeIndicator from '../claude/ModeIndicator'

export default function CallToAction() {
  const router = useRouter()

  const handleShiftClick = () => {
    // Small delay to show animation before navigating
    setTimeout(() => {
      router.push('/invite')
    }, 200)
  }

  return (
    <section className="py-24 px-4 bg-bg-secondary">
      <div className="max-w-2xl mx-auto text-center">
        <div className="flex justify-center mb-4">
          <ModeIndicator mode="act" />
        </div>
        <h2 className="text-3xl font-bold mb-4 text-text-primary">
          Ready to Shift?
        </h2>
        <p className="text-text-secondary mb-8">
          Invite-only event. Apply now and we&apos;ll get back to you.
        </p>

        <ShiftKey size="lg" pulsing onClick={handleShiftClick} />

        <p className="text-text-muted text-sm font-mono mt-6">
          // limited spots available
        </p>
      </div>
    </section>
  )
}
