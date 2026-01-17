import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface AppLayoutProps {
  children: React.ReactNode;
  username: string | null;
  slackAvailable: boolean;
  needsWhatsAppPairing?: boolean;
  needsSlackSetup?: boolean;
  stats: any;
  onLogout: () => void;
  onRefresh: () => void;
  onOpenCapabilities: () => void;
  onOpenCommandPalette?: () => void;
}

export function AppLayout({
  children,
  username,
  slackAvailable,
  needsWhatsAppPairing,
  needsSlackSetup,
  stats,
  onLogout,
  onRefresh,
  onOpenCapabilities,
  onOpenCommandPalette,
}: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar
        slackAvailable={slackAvailable}
        needsWhatsAppPairing={needsWhatsAppPairing}
        needsSlackSetup={needsSlackSetup}
        stats={stats}
      />
      
      <Header
        username={username}
        onLogout={onLogout}
        onRefresh={onRefresh}
        onOpenCapabilities={onOpenCapabilities}
        onOpenCommandPalette={onOpenCommandPalette}
      />

      <main className="ml-64 p-8 animate-fade-in">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
