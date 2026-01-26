import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'The Shift | AI Builders Summit 2025',
  description: 'Press Shift to change everything. An exclusive event for Israel\'s tech leaders.',
  openGraph: {
    title: 'The Shift | AI Builders Summit 2025',
    description: 'Press Shift to change everything. An exclusive event for Israel\'s tech leaders.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  )
}
