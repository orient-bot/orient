import { Metadata } from 'next'
import Header from '@/components/keyboard/Header'
import VimController from '@/components/keyboard/VimController'
import EventHero from '@/components/event/EventHero'
import EventDetails from '@/components/event/EventDetails'
import EventAgenda from '@/components/event/EventAgenda'
import Speakers from '@/components/event/Speakers'
import CallToAction from '@/components/event/CallToAction'

export const metadata: Metadata = {
  title: 'The Shift | AI Builders Summit 2025',
  description: 'Press Shift to change everything. An exclusive event for Israel\'s tech leaders.',
}

export default function EventPage() {
  return (
    <VimController>
      <Header />
      <main className="min-h-screen pt-20 pb-40">
        <EventHero />
        <EventDetails />
        <EventAgenda />
        <Speakers />
        <CallToAction />
      </main>
    </VimController>
  )
}
