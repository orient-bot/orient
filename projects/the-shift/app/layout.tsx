import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://the-shift-toms-projects-02725b39.vercel.app'),
  title: 'The Shift | AI Builders Summit 2026',
  description: "Press Shift to change everything. An exclusive event for Israel's tech leaders.",
  icons: {
    icon: '/favicon.ico',
    apple: '/icon-192.png',
  },
  openGraph: {
    title: 'The Shift | AI Builders Summit 2026',
    description: "Press Shift to change everything. An exclusive event for Israel's tech leaders.",
    type: 'website',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'The Shift - AI Builders Summit 2026',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Shift | AI Builders Summit 2026',
    description: 'Press Shift to change everything. An exclusive event for Israel\'s tech leaders.',
    images: ['/og-image.jpg'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  if (theme === 'dark' || (!theme && systemDark)) {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
