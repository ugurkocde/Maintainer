import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Maintainer',
  description: 'Live orchestration view of automated repository maintenance.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-ink-700/60 bg-ink-900/80 backdrop-blur sticky top-0 z-10">
            <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
              <a href="/" className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-accent-500" />
                <span className="font-semibold tracking-tight">Maintainer</span>
                <span className="text-ink-400 text-sm">command center</span>
              </a>
              <nav className="text-sm text-ink-400">
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
          <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
