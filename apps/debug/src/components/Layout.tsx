import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import {
  Activity,
  BarChart3,
  Disc,
  type LucideIcon,
  Moon,
  ScrollText,
  Send,
  Share2,
  Sun,
  Terminal,
} from 'lucide-react'
import { router } from '../App'

type RoutePath = '/' | '/topics' | '/rpc' | '/logs' | '/mcap' | '/flow' | '/publish'

interface NavItem {
  path: RoutePath
  label: string
  icon: LucideIcon
  shortcut: string
}

const NAV_ITEMS: readonly NavItem[] = [
  { path: '/', label: 'Overview', icon: Activity, shortcut: '1' },
  { path: '/topics', label: 'Topics', icon: Share2, shortcut: '2' },
  { path: '/rpc', label: 'RPC', icon: Terminal, shortcut: '3' },
  { path: '/logs', label: 'Logs', icon: ScrollText, shortcut: '4' },
  { path: '/mcap', label: 'MCAP', icon: Disc, shortcut: '5' },
  { path: '/flow', label: 'Flow', icon: BarChart3, shortcut: '6' },
  { path: '/publish', label: 'Publish', icon: Send, shortcut: '7' },
] as const

// ── Status bar polling ──────────────────────────────────────────────

interface StatusData {
  topics: number
  plugins: number
  bridgeActive: boolean
  error: boolean
}

function useStatusPolling(): StatusData {
  const [status, setStatus] = useState<StatusData>({
    topics: 0,
    plugins: 0,
    bridgeActive: false,
    error: false,
  })

  useEffect(() => {
    let active = true

    async function poll(): Promise<void> {
      const results = await Promise.allSettled([
        fetch('/api/topics:stats').then((r) => r.json()),
        fetch('/api/processes:list').then((r) => r.json()),
        fetch('/api/bridge:status').then((r) => r.json()),
      ])

      if (!active) return

      const next: StatusData = { topics: 0, plugins: 0, bridgeActive: false, error: false }

      if (results[0].status === 'fulfilled') {
        const data = results[0].value?.data
        next.topics = Array.isArray(data) ? data.length : 0
      }
      if (results[1].status === 'fulfilled') {
        const data = results[1].value?.data
        next.plugins = Array.isArray(data) ? data.length : 0
      }
      if (results[2].status === 'fulfilled') {
        next.bridgeActive = results[2].value?.data?.active ?? false
      }

      const hasError = results.some(r => r.status === 'rejected')
      setStatus({ ...next, error: hasError })
    }

    poll()
    const interval = setInterval(poll, 5000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  return status
}

// ── Dark mode ───────────────────────────────────────────────────────

const THEME_KEY = 'modacs-debug-theme'

function useDarkMode(): [boolean, () => void] {
  const [dark, setDark] = useState<boolean>(() => {
    const stored = localStorage.getItem(THEME_KEY)
    return stored === null ? true : stored === 'dark'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
  }, [dark])

  const toggle = useCallback(() => setDark((d) => !d), [])
  return [dark, toggle]
}

// ── Keyboard shortcuts (1-7) ────────────────────────────────────────

function useKeyboardShortcuts(): void {
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      ) {
        return
      }

      const key = e.key
      if (key >= '1' && key <= '7') {
        const idx = parseInt(key, 10) - 1
        const item = NAV_ITEMS[idx]
        if (item) {
          e.preventDefault()
          router.navigate({ to: item.path })
        }
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])
}

// ── Layout component ────────────────────────────────────────────────

export function Layout(): JSX.Element {
  const [dark, toggleDark] = useDarkMode()
  const status = useStatusPolling()
  useKeyboardShortcuts()

  const currentPath = useRouterState({
    select: (s) => s.location.pathname,
  })

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Header */}
      <header className="h-12 shrink-0 flex items-center justify-between px-4 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <h1 className="text-sm font-bold tracking-wide">MODACS Debug</h1>
        <button
          onClick={toggleDark}
          className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          aria-label="Toggle theme"
        >
          {dark ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>
      </header>

      {/* Body: sidebar + main */}
      <div className="flex flex-1 overflow-hidden">
        <nav className="w-48 shrink-0 py-2 bg-zinc-100 dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = currentPath.replace(/^\/debug/, '') === item.path || (item.path === '/' && (currentPath === '/debug' || currentPath === '/debug/'))
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
                <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-600">
                  {item.shortcut}
                </span>
              </Link>
            )
          })}
        </nav>

        <main className="flex-1 overflow-auto bg-white dark:bg-zinc-950">
          <Outlet />
        </main>
      </div>

      {/* Bottom status bar */}
      <footer className="h-7 shrink-0 flex items-center gap-4 px-4 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
        {status.error ? (
          <span className="flex items-center gap-1 text-amber-500">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Server unreachable
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Server
          </span>
        )}
        <span>Topics: {status.topics}</span>
        <span>Plugins: {status.plugins}</span>
        <span className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${status.bridgeActive ? 'bg-green-500' : 'bg-red-500'}`}
          />
          Bridge
        </span>
      </footer>
    </div>
  )
}