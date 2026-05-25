import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Atrius Planner',
  description: 'Sistema de Planejamento de Produção',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  )
}
