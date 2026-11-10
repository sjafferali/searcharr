import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bookmark, Search, Server, HardDrive, Magnet, History, Rss } from 'lucide-react'
import { cn } from '../utils'
import { useInstancesStatus } from '../hooks'
import { ThemeToggle } from './ThemeToggle'

interface LayoutProps {
  children: ReactNode
}

const navItems = [
  { id: 'search', path: '/', label: 'Search', icon: Search },
  { id: 'feeds', path: '/feeds', label: 'Feeds', icon: Rss },
  { id: 'bookmarks', path: '/bookmarks', label: 'Bookmarks', icon: Bookmark },
  { id: 'history', path: '/history', label: 'History', icon: History },
  { id: 'instances', path: '/instances', label: 'Instances', icon: Server },
  { id: 'clients', path: '/clients', label: 'Clients', icon: HardDrive },
]

export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { data: instancesStatus } = useInstancesStatus()

  const onlineCount = instancesStatus?.total_online ?? 0

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950">
        <div className="mx-auto flex h-14 max-w-screen-2xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-slate-100">
            <Magnet className="h-[18px] w-[18px] text-cyan-400" />
            <span className="hidden text-base font-semibold sm:inline">Searcharr</span>
          </Link>

          <nav className="flex items-center gap-1">
            {navItems.map((tab) => {
              const isActive =
                tab.path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(tab.path)

              return (
                <Link
                  key={tab.id}
                  to={tab.path}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex h-8 items-center gap-2 rounded-lg px-2 text-sm transition-colors md:px-3',
                    isActive
                      ? 'bg-slate-800 font-medium text-slate-100'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100',
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  <span className="hidden md:inline">{tab.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* Source lamp: lit only when an instance is actually reachable */}
          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <Link
              to="/instances"
              className="flex items-center gap-2 text-xs text-slate-400 transition-colors hover:text-slate-100"
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  onlineCount > 0 ? 'bg-emerald-400' : 'bg-slate-600',
                )}
              />
              <span className="hidden font-mono lg:inline">
                {onlineCount} {onlineCount === 1 ? 'source' : 'sources'} online
              </span>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  )
}
