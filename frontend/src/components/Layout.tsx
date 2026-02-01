import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Search, Server, HardDrive, Magnet } from 'lucide-react'
import { cn } from '../utils'
import { useInstancesStatus } from '../hooks'

interface LayoutProps {
  children: ReactNode
}

const navItems = [
  { id: 'search', path: '/', label: 'Search', icon: Search },
  { id: 'instances', path: '/instances', label: 'Instances', icon: Server },
  { id: 'clients', path: '/clients', label: 'Clients', icon: HardDrive },
]

export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { data: instancesStatus } = useInstancesStatus()

  const onlineCount = instancesStatus?.total_online ?? 0

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Ambient background effects */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/4 top-0 h-96 w-96 rounded-full bg-cyan-500/5 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-violet-500/5 blur-3xl" />
        <div className="bg-ambient absolute inset-0" />
        {/* Grid pattern overlay */}
        <div className="bg-grid-pattern absolute inset-0" />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <header className="glass sticky top-0 z-20 border-b border-slate-800/50">
          <div className="mx-auto max-w-7xl px-4 py-3">
            <div className="flex items-center justify-between">
              {/* Logo */}
              <Link to="/" className="flex items-center gap-3">
                <div className="relative">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/25">
                    <Magnet className="h-5 w-5 text-white" />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-900 bg-emerald-500" />
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight">
                    <span className="text-cyan-400">Search</span>
                    <span className="text-slate-200">arr</span>
                  </h1>
                  <p className="text-[10px] uppercase tracking-widest text-slate-500">
                    Unified Search Aggregator
                  </p>
                </div>
              </Link>

              {/* Navigation Tabs */}
              <nav className="flex items-center gap-1 rounded-lg border border-slate-700/50 bg-slate-800/50 p-1">
                {navItems.map((tab) => {
                  const isActive =
                    tab.path === '/'
                      ? location.pathname === '/'
                      : location.pathname.startsWith(tab.path)

                  return (
                    <Link
                      key={tab.id}
                      to={tab.path}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all',
                        isActive
                          ? 'bg-slate-700 text-cyan-400 shadow-lg shadow-cyan-500/10'
                          : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200',
                      )}
                    >
                      <tab.icon className="h-4 w-4" />
                      {tab.label}
                    </Link>
                  )
                })}
              </nav>

              {/* Quick Stats */}
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-800/50 px-3 py-1.5">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  <span className="text-slate-400">{onlineCount} sources online</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </div>
    </div>
  )
}
