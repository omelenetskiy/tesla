'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from '@/components/theme-provider'

const navigationItems = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/trips', label: 'Trips', icon: '🗺️' },
  { href: '/charging', label: 'Charging', icon: '⚡' },
  { href: '/battery', label: 'Battery', icon: '🔋' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
]

export function Navigation() {
  const pathname = usePathname()
  const { theme, setTheme, actualTheme } = useTheme()

  return (
    <nav className="fixed top-0 left-0 right-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-500 dark:bg-red-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">T</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-white">Tesla</span>
          </div>

          {/* Main Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navigationItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  px-3 py-2 rounded-md text-sm font-medium transition-all
                  ${
                    pathname === item.href
                      ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-100'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                  }
                `}
              >
                <span className="mr-2">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>

          {/* Theme Switcher */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
              aria-label="Toggle theme"
            >
              {actualTheme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden flex items-center gap-1 pb-2 overflow-x-auto">
          {navigationItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`
                px-3 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap
                ${
                  pathname === item.href
                    ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-100'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                }
              `}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navigation />
      <main className="pt-16 md:pt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  )
}

