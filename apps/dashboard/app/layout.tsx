import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata: Metadata = {
  title: 'Maintainer · Live OSS automation',
  description:
    'Maintainer is a fleet of AI agents that triages issues, drafts pull requests, and keeps open-source repositories healthy. Watch it work in real time.',
  openGraph: {
    title: 'Maintainer · Live OSS automation',
    description:
      'A fleet of AI agents that triages issues and drafts pull requests for open-source repositories. Live.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans">
        <div className="min-h-screen flex flex-col">
          <header className="sticky top-0 z-20 border-b border-white/[0.05] bg-ink-900/70 backdrop-blur-md">
            <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
              <a href="/" className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
                </span>
                <span className="font-semibold tracking-tight text-base">Maintainer</span>
                <span className="text-ink-400 text-xs hidden sm:inline">live OSS automation</span>
              </a>
              <nav className="text-sm text-ink-400 flex items-center gap-5">
                <a href="/#how-it-works" className="hover:text-ink-100">how</a>
                <a href="/#repos" className="hover:text-ink-100">repos</a>
                <a
                  href="https://github.com/ugurkocde/Maintainer"
                  className="hover:text-ink-100"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  source
                </a>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-6 py-10 flex-1 w-full">{children}</main>
          <footer className="border-t border-white/[0.05] mt-16">
            <div className="mx-auto max-w-7xl px-6 py-6 text-xs text-ink-400 flex items-center justify-between">
              <span>
                Built by{' '}
                <a
                  href="https://ugurlabs.com"
                  className="text-ink-200 hover:text-ink-100"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ugurlabs
                </a>
              </span>
              <span>powered by Claude · Supabase · Vercel</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
