import type { Metadata } from 'next'
import './globals.css'
import { ToastViewport } from '@/components/ui/ToastViewport'

export const metadata: Metadata = {
  title: 'Atrius Planner',
  description: 'Sistema de Planejamento de Produção',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        {children}
        <ToastViewport />
      </body>
    </html>
  )
}
