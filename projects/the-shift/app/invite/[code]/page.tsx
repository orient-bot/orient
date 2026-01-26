import Header from '@/components/keyboard/Header'
import InviteHero from '@/components/invite/InviteHero'
import InviteForm from '@/components/invite/InviteForm'

const kolNames: Record<string, string> = {
  shaul: 'Shaul',
  tom: 'Tom',
  ori: 'Ori',
  yonatan: 'Yonatan',
}

interface PageProps {
  params: Promise<{ code: string }>
}

export default async function KolInvitePage({ params }: PageProps) {
  const { code } = await params
  const kolName = kolNames[code.toLowerCase()]

  return (
    <>
      <Header />
      <main className="min-h-screen flex flex-col items-center justify-center px-4 py-24">
        <div className="w-full max-w-md">
          <InviteHero kolName={kolName} />
          <InviteForm kolCode={code.toLowerCase()} />
        </div>
      </main>
    </>
  )
}

export async function generateMetadata({ params }: PageProps) {
  const { code } = await params
  const kolName = kolNames[code.toLowerCase()]

  return {
    title: kolName
      ? `Invited by ${kolName} | The Shift`
      : 'The Shift | AI Builders Summit 2025',
    description: 'Press Shift to change everything. Apply to attend.',
  }
}
