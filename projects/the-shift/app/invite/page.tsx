import Header from '@/components/keyboard/Header';
import InviteHero from '@/components/invite/InviteHero';
import InviteForm from '@/components/invite/InviteForm';

export default function InvitePage() {
  return (
    <>
      <Header />
      <main className="min-h-screen flex flex-col items-center justify-center px-4 py-24">
        <div className="w-full max-w-md">
          <InviteHero />
          <InviteForm />
        </div>
      </main>
    </>
  );
}
