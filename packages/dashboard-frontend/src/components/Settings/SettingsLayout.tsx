import { ReactNode } from 'react';
import { SettingsNav } from './SettingsNav';
import type { SettingsView } from '../../routes';

interface SettingsLayoutProps {
  children: ReactNode;
  currentView: SettingsView;
}

export function SettingsLayout({ children, currentView }: SettingsLayoutProps) {
  return (
    <div className="flex gap-8">
      <SettingsNav currentView={currentView} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
