import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import './portal.css'

export const metadata: Metadata = {
  title: 'CALM BREAK — Pause, Refresh, Recharge',
  description:
    'A little pause goes a long way. Order from the Calm Break café and tuck shop, with one combined order.',
  generator: 'v0.app',
  icons: { icon: '/calm-break-icon.png', apple: '/calm-break-mark.png' },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#081e3d',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
