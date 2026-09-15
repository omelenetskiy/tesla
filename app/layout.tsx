import type { Metadata, Viewport } from 'next'
import { Geist_Mono, Roboto } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

/**
 * Primary UI type: Roboto. Numeric/meta accents: Geist Mono.
 */
const roboto = Roboto({ subsets: ['latin', 'cyrillic'], display: 'swap', weight: ['400', '500', '700'] })
const geistMono = Geist_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: 'DriveScope - Tesla',
  description: 'Tesla companion for an owner: state, location, trips, battery and charging.',
  applicationName: 'DriveScope',
  icons: {
    icon: [{ url: '/icons/icon-32.png', type: 'image/png', sizes: '32x32' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: { capable: true, title: 'DriveScope', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0f16',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${roboto.className} ${geistMono.variable}`}>
        <ThemeProvider>
          <link rel="preconnect" href="https://tiles.openfreemap.org" crossOrigin="anonymous" />
          <link rel="dns-prefetch" href="https://tiles.openfreemap.org" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <script
            dangerouslySetInnerHTML={{
              __html: `
(function(){try{var p=localStorage.getItem('theme')||'system';var dark=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',dark?'dark':'light')}catch(e){document.documentElement.setAttribute('data-theme','light')}})();`,
            }}
          />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
