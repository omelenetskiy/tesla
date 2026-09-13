import type { Metadata, Viewport } from 'next'
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
  applicationName: 'DriveScope',
  // The tab itself takes /favicon.ico, which every browser asks for by that name without
  // being told; these are the links for the sizes that file cannot cover — the 180px tile
  // iOS puts on a home screen, and a crisp PNG for a browser that prefers one to an ICO.
  icons: {
    icon: [{ url: '/icons/icon-32.png', type: 'image/png', sizes: '32x32' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  // `capable` is what makes a saved DriveScope open as its own app rather than as a Safari
  // tab; `black-translucent` lets the manifest's theme colour show through the status bar,
  // which is the pairing that makes env(safe-area-inset-top) mean something — see the
  // viewport export below and the padding in components/shell/app-shell.tsx.
  appleWebApp: { capable: true, title: 'DriveScope', statusBarStyle: 'black-translucent' },
}

/**
 * `viewport-fit=cover` is the half of the home-screen experience that is not the icon.
 *
 * Without it the page is letterboxed inside the safe area and every `env(safe-area-inset-*)`
 * resolves to zero — which is why the bottom dock in the app shell already reserves padding
 * with those variables and has never once used any of it. With it, the shell's own padding
 * becomes live and the content runs edge to edge under the notch and the home indicator.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Painted behind the status bar in the installed app, and behind the toolbar in a tab.
  themeColor: '#0b0f16',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        {/*
          The basemap's first paint is a serial chain — style, then sprite, then glyphs,
          then tiles — and none of it can begin until React has mounted and MapLibre has
          been constructed, so the DNS lookup and TLS handshake are paid at the worst
          possible moment. Preconnecting starts both during HTML parse.

          Measured cold against tiles.openfreemap.org: style 25 KB, sprite 27 KB + 119 KB,
          three Noto Sans glyph sets at ~78 KB each, one z14 vector tile 358 KB. Everything
          but the style is cached for a year, so a slow *repeat* load means the browser
          cache is being bypassed (DevTools "Disable cache", or a hard reload) rather than
          the host being slow.

          No `rel=preload` for the style itself: React 19 hoists a JSX preload into <head>
          and leaves the rendered element in place, which emitted the tag twice.
        */}
        <link rel="preconnect" href="https://tiles.openfreemap.org" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://tiles.openfreemap.org" />
        {/*
          Hand-written because the metadata API cannot produce it: `appleWebApp.capable` in
          Next 16 emits only `mobile-web-app-capable` — the string
          `apple-mobile-web-app-capable` appears nowhere in its metadata code, checked in
          node_modules/next/dist/lib/metadata/metadata.js. That is the tag iOS has used to
          decide whether a saved page opens as its own app since iOS 11.3, and the manifest's
          `display: standalone` does not replace it on the versions an owner's phone is
          plausibly running. Both are emitted; they agree.
        */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* Theme initialisation runs before paint to avoid a flash of the wrong
            scheme. 'system' resolves against prefers-color-scheme here exactly as
            lib/hooks/use-theme.ts does afterwards, so client and HTML agree. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function(){try{var p=localStorage.getItem('theme')||'system';var dark=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',dark?'dark':'light')}catch(e){document.documentElement.setAttribute('data-theme','light')}})();`,
          }}
        />
        {children}
      </body>
    </html>
  )
}
