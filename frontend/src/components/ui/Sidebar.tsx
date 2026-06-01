'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Calendar,
  BarChart3,
  Settings,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

const navItems = [
  { name: 'Dashboard', href: '/planner', icon: LayoutDashboard },
  { name: 'Calendário', href: '/calendario', icon: Calendar },
  { name: 'Monitoramento', href: '/monitoramento', icon: BarChart3 },
  { name: 'Administração', href: '/admin', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <aside
      className={`relative sticky top-0 flex h-screen flex-col border-r border-[#E4E7EC] bg-white transition-all duration-150 ${
        isCollapsed ? 'w-[74px]' : 'w-[288px]'
      }`}
    >
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-20 z-50 rounded-full border border-[#E4E7EC] bg-white p-1 text-[#4B5563] shadow-[var(--shadow-sm)] hover:border-[#CDD2DA] hover:bg-[#F7F8FA] hover:text-[#111827]"
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <div className="flex justify-center px-4 py-6">
        <img src="/logoAtrius.webp" alt="Atrius Logo" className="h-10 w-auto" />
      </div>

      <nav className="flex-1 px-3">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                title={isCollapsed ? item.name : ''}
                className={`relative flex rounded-[8px] text-sm font-medium transition-all duration-[120ms] ${
                  isCollapsed ? 'h-10 justify-center px-2' : 'min-h-[48px] items-center gap-3 px-3 py-2'
                } ${
                  isActive
                    ? 'bg-[#EFF6FF] text-[#2563EB]'
                    : 'text-[#4B5563] hover:bg-[#F0F2F5] hover:text-[#111827]'
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-[#2563EB]" />
                )}
                <Icon size={18} className={`shrink-0 ${isActive ? 'text-[#2563EB]' : 'text-[#9CA3AF]'}`} />
                {!isCollapsed && (
                  <span className="line-clamp-2 leading-5 text-left">
                    {item.name}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </nav>

      <div className={`border-t border-[#E4E7EC] p-4 ${isCollapsed ? 'flex justify-center' : ''}`}>
        <div className={`flex items-center gap-3 ${isCollapsed ? '' : 'px-1'}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-xs font-semibold text-white">
            JD
          </div>
          {!isCollapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#111827]">John Doe</p>
              <p className="truncate text-xs text-[#9CA3AF]">Operador</p>
            </div>
          )}
        </div>

        {!isCollapsed && (
          <div className="mt-3 flex items-center gap-2 px-1">
            <span className="h-2 w-2 rounded-full bg-[#16A34A] [animation:status-pulse_2s_infinite]" />
            <span className="text-xs text-[#9CA3AF]">Conectado</span>
          </div>
        )}
      </div>
    </aside>
  )
}
