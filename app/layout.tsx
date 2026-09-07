import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
    title: 'DRIVE / SCOPE',
    description: 'Sleep-safe Tesla vehicle observability dashboard.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="ru" suppressHydrationWarning>
        <body className={inter.className}>
        {/* Theme initialization script — runs before paint to avoid flash */}
        <script dangerouslySetInnerHTML={{ __html: `
(function(){try{var t=localStorage.getItem('theme');if(t){document.documentElement.setAttribute('data-theme',t)}else if(!window.matchMedia('(prefers-color-scheme:dark)').matches){document.documentElement.setAttribute('data-theme','light')}}catch(e){}})();` }} />
        {children}
        </body>
        </html>
    )
}
