import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

/**
 * Cyrillic subsets are kept because the previous build shipped them and a user may
 * still have Russian content in history rows; the interface itself is English.
 */
const inter = Inter({ subsets: ['latin', 'cyrillic', 'cyrillic-ext'], display: 'swap' })

export const metadata: Metadata = {
  title: 'DriveScope — Tesla',
  description: 'Tesla companion for an owner: state, location, trips, battery and charging.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en" suppressHydrationWarning>
        <head>
          {/* The basemap's style, sprites, glyphs and tiles all come from one host, and
              the first paint waits on all four. Starting its DNS+TLS handshake while
              the HTML parses is the cheapest available win against "the map loads
              very slowly". */}
          <link rel="preconnect" href="https://tiles.openfreemap.org" />
          <link rel="dns-prefetch" href="https://tiles.openfreemap.org" />
        </head>
        <body className={inter.className}>
        {/* Theme initialisation runs before paint to avoid a flash of the wrong
            scheme. 'system' resolves against prefers-color-scheme here exactly as
            lib/hooks/use-theme.ts does afterwards, so client and HTML agree. */}
        <script dangerouslySetInnerHTML={{ __html: `
(function(){try{var p=localStorage.getItem('theme')||'system';var dark=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',dark?'dark':'light')}catch(e){document.documentElement.setAttribute('data-theme','light')}})();` }} />
        {children}
        </body>
        </html>
    )
}
