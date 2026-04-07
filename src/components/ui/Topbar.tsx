 'use client'

import { usePathname } from 'next/navigation'
import { Bell, Wifi } from 'lucide-react'

export function Topbar() {
  const pathname = usePathname()

  const getPageTitle = (path: string) => {
    if (path.startsWith('/planner')) return 'Dashboard Operacional'
    if (path.startsWith('/calendario')) return 'Planejamento Visual'
    if (path.startsWith('/monitoramento')) return 'Monitoramento Realtime'
    if (path.startsWith('/admin')) return 'Administração do Sistema'
    return 'Atrius Planner'
  }

  return (
    <header className="h-[56px] border-b border-blue-100 bg-blue-50 px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      <div className="flex items-center gap-4">
        <h2 className="text-sm font-bold text-slate-900 tracking-tight">{getPageTitle(pathname)}</h2>
        <div className="h-4 w-[1px] bg-slate-200" />
        <nav className="flex items-center gap-2 text-[11px] font-semibold text-slate-400">
          <span className="hover:text-slate-600 cursor-default transition-colors">Home</span>
          <span className="text-slate-300">/</span>
          <span className="text-blue-600 capitalize">{pathname.replace('/', '')}</span>
        </nav>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100">
          <Wifi size={12} className="text-emerald-500 animate-pulse" />
          <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-tight">Connected</span>
        </div>
        
        <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors relative">
          <Bell size={20} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
        </button>
      </div>
    </header>
  )
}