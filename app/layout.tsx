import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Pragati - Fueling Dreams Through Sports',
  description:
    'Empowering hidden talent from villages to stadiums. Sports empowerment for underprivileged youth in India.',
  generator: 'v0.app',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${GeistSans.className} ${GeistMono.className}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}