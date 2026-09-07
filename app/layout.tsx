import type {Metadata} from 'next'
import './globals.css'

export const metadata: Metadata = {
    title: 'KITE // Vehicle telemetry',
    description: 'Sleep-safe Tesla vehicle data dashboard.',
}

export default function RootLayout({children}: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en">
        <body>{children}</body>
        </html>
    )
}

