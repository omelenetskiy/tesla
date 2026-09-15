'use client'

import React, { useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { Card, Button, Badge } from '@/components/ui/primitives'
import { Alert } from '@/components/ui/forms'
import { useTheme } from '@/components/theme-provider'
import { useSettings } from '@/lib/hooks/use-settings'

export default function SettingsPage() {
  const { theme, setTheme, actualTheme } = useTheme()
  const { settings, loading, saving, error, updateSettings } = useSettings()
  const [showSuccess, setShowSuccess] = useState(false)

  const saveField = async <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => {
    const ok = await updateSettings({ [key]: value })
    if (ok) {
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 2000)
    }
  }

  const handleExportData = async () => {
    const data = {
      settings,
      exportDate: new Date().toISOString(),
      version: '1.0',
    }
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `tesla-app-export-${Date.now()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleClearData = async () => {
    if (window.confirm('Are you sure? This will clear all local data.')) {
      localStorage.clear()
      window.location.reload()
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="max-w-2xl space-y-6">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <Card className="p-6">Loading settings...</Card>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="max-w-2xl space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Settings</h1>
          {saving && <Badge>Saving...</Badge>}
        </div>

        {showSuccess && (
          <Alert
            variant="success"
            title="Settings Saved"
            message="Your settings have been updated"
            onClose={() => setShowSuccess(false)}
          />
        )}

        {error && (
          <Alert
            variant="error"
            title="Save failed"
            message={error}
          />
        )}

        <Card className="p-6">
          <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">Appearance</h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="font-medium text-gray-900 dark:text-white">Theme</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setTheme('light')}
                  className={`rounded-md px-4 py-2 transition-all ${
                    theme === 'light'
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white'
                  }`}
                >
                  ☀️ Light
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className={`rounded-md px-4 py-2 transition-all ${
                    theme === 'dark'
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white'
                  }`}
                >
                  🌙 Dark
                </button>
                <button
                  onClick={() => setTheme('system')}
                  className={`rounded-md px-4 py-2 transition-all ${
                    theme === 'system'
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white'
                  }`}
                >
                  💻 System
                </button>
              </div>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Current: <Badge>{actualTheme === 'light' ? '☀️ Light' : '🌙 Dark'}</Badge>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">Units & Locale</h2>

          <div className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">Distance unit</label>
              <div className="flex gap-2">
                <Button
                  variant={settings.distanceUnit === 'km' ? 'primary' : 'outline'}
                  onClick={() => saveField('distanceUnit', 'km')}
                >
                  Kilometers
                </Button>
                <Button
                  variant={settings.distanceUnit === 'mi' ? 'primary' : 'outline'}
                  onClick={() => saveField('distanceUnit', 'mi')}
                >
                  Miles
                </Button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">Temperature unit</label>
              <div className="flex gap-2">
                <Button
                  variant={settings.temperatureUnit === 'C' ? 'primary' : 'outline'}
                  onClick={() => saveField('temperatureUnit', 'C')}
                >
                  Celsius
                </Button>
                <Button
                  variant={settings.temperatureUnit === 'F' ? 'primary' : 'outline'}
                  onClick={() => saveField('temperatureUnit', 'F')}
                >
                  Fahrenheit
                </Button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">Time zone</label>
              <input
                value={settings.timeZone}
                onChange={(e) => void saveField('timeZone', e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">Locale</label>
              <input
                value={settings.locale}
                onChange={(e) => void saveField('locale', e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">Application</h2>

          <div className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">
                Polling Interval (seconds)
              </label>
              <input
                type="range"
                min="10"
                max="300"
                value={settings.pollingInterval}
                onChange={(e) => void saveField('pollingInterval', Number(e.target.value))}
                className="w-full"
              />
              <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">{settings.pollingInterval} seconds</div>
            </div>

            <div>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={settings.enableNotifications}
                  onChange={(e) => void saveField('enableNotifications', e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="font-medium text-gray-900 dark:text-white">Enable notifications</span>
              </label>
            </div>

            <div>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={settings.enableAnalytics}
                  onChange={(e) => void saveField('enableAnalytics', e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="font-medium text-gray-900 dark:text-white">Enable analytics</span>
              </label>
            </div>

            <div>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={settings.locationHistoryEnabled}
                  onChange={(e) => void saveField('locationHistoryEnabled', e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="font-medium text-gray-900 dark:text-white">Store location history</span>
              </label>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-900 dark:text-white">Data Retention Policy</label>
              <select
                value={settings.dataRetention}
                onChange={(e) => void saveField('dataRetention', e.target.value as '30d' | '90d' | '1y' | 'unlimited')}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              >
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="1y">Last year</option>
                <option value="unlimited">Unlimited</option>
              </select>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">Data Management</h2>

          <div className="space-y-4">
            <Button onClick={handleExportData} variant="secondary" className="w-full">
              📥 Export My Data
            </Button>
            <Button onClick={handleClearData} variant="outline" className="w-full">
              🗑️ Clear All Data
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
