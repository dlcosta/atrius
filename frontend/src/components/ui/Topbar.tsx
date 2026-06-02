'use client'

import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'

export function Topbar() {
  const pathname = usePathname()

  const getPageTitle = (path: string) => {
    if (path.startsWith('/planner')) return 'Dashboard Operacional'
    if (path.startsWith('/calendario')) return 'Planejamento Visual'
    if (path.startsWith('/monitoramento')) return 'Monitoramento em Tempo Real'
    if (path.startsWith('/ordem-producao-tanques')) return 'Ordem de Produção - Tanques'
    if (path.startsWith('/ordem-producao-envase')) return 'Ordem de Produção - Envase'
    if (path.startsWith('/admin')) return 'Administração do Sistema'
    return 'Atrius Planner'
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#E4E7EC] bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-4">
        <h2 className="truncate text-sm font-semibold text-[#111827]">{getPageTitle(pathname)}</h2>
        <div className="hidden h-4 w-px bg-[#E4E7EC] sm:block" />
        <nav className="hidden items-center gap-2 text-[11px] font-medium text-[#9CA3AF] sm:flex">
          <span className="cursor-default">Home</span>
          <span>/</span>
          <span className="capitalize text-[#4B5563]">{pathname.replace('/', '')}</span>
        </nav>
      </div>

      <button className="relative rounded-[8px] border border-transparent p-2 text-[#9CA3AF] hover:border-[#E4E7EC] hover:bg-[#F7F8FA] hover:text-[#4B5563]">
        <Bell size={18} />
        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#DC2626] ring-2 ring-white" />
      </button>
    </header>
  )
}
