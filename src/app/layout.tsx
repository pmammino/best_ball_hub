import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Best Ball Hub',
  description: 'Visualize your best-ball draft exposures',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  )
}
