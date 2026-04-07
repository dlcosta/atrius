'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Calendar, BarChart3, Settings, LayoutDashboard, ChevronLeft, ChevronRight } from 'lucide-react'

const navItems = [
  { name: 'Dashboard', href: '/planner', icon: LayoutDashboard },
  { name: 'Calendário', href: '/calendario', icon: Calendar },
  { name: 'Monitoramento', href: '/monitoramento', icon: BarChart3 },
  { name: 'Admin', href: '/admin', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <aside 
      className={`border-r border-slate-200 bg-slate-50 flex flex-col h-screen sticky top-0 transition-all duration-300 relative ${
        isCollapsed ? 'w-[70px]' : 'w-[240px]'
      }`}
    >
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-20 bg-white border border-slate-200 rounded-full p-1 shadow-sm hover:bg-slate-50 text-slate-400 hover:text-blue-600 transition-all z-50"
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <div className="p-6 mb-2 flex justify-center">
        <div className="flex items-center text-blue-600 font-bold text-xl overflow-hidden">
          <div className="flex-shrink-0">
            <img src="/logoAtrius.webp" alt="Atrius Logo" className="h-10 w-auto" />
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.name : ''}
              className={`flex items-center rounded-md text-sm font-semibold transition-all group ${
                isCollapsed ? 'justify-center py-3' : 'gap-3 px-3 py-2'
              } ${
                isActive
                  ? 'bg-blue-100 text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:bg-blue-50 hover:text-slate-900'
              }`}
            >
              <div className="flex-shrink-0">
                <Icon size={20} className={isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-900'} />
              </div>
              {!isCollapsed && <span className="truncate animate-in fade-in slide-in-from-left-1">{item.name}</span>}
            </Link>
          )
        })}
      </nav>

      <div className={`p-4 border-t border-slate-200 ${isCollapsed ? 'flex justify-center' : ''}`}>
        <div className={`flex items-center gap-3 ${isCollapsed ? '' : 'px-3 py-2'}`}>
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-sm flex-shrink-0">
            JD
          </div>
          {!isCollapsed && (
            <div className="flex flex-col overflow-hidden animate-in fade-in slide-in-from-left-2">
              <span className="text-xs font-bold text-slate-900 truncate">John Doe</span>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Operador</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}