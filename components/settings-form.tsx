'use client'

import React from 'react'
import { Input, Button, Card } from '@/components/ui/primitives'

export function SettingsForm({
  onSave,
}: {
  onSave: (data: any) => Promise<void>
}) {
  const [isLoading, setIsLoading] = React.useState(false)
  const [data, setData] = React.useState({
    apiKey: '',
    pollingInterval: 30,
    enableNotifications: true,
    theme: 'system',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = e.target
    const { name } = target

    let nextValue: string | number | boolean
    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
      nextValue = target.checked
    } else if (target instanceof HTMLInputElement && target.type === 'range') {
      nextValue = Number(target.value)
    } else {
      nextValue = target.value
    }

    setData((prev) => ({
      ...prev,
      [name]: nextValue,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      await onSave(data)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="p-6 max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        Settings
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label="API Key"
          name="apiKey"
          type="password"
          value={data.apiKey}
          onChange={handleChange}
          placeholder="Enter your Tesla API key"
          helpText="Your API key is stored securely and never shared"
        />

        <div>
          <label className="text-sm font-medium text-gray-900 dark:text-white block mb-2">
            Polling Interval (seconds)
          </label>
          <input
            type="range"
            name="pollingInterval"
            min="10"
            max="300"
            value={data.pollingInterval}
            onChange={handleChange}
            className="w-full"
          />
          <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            {data.pollingInterval} seconds
          </div>
        </div>

        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="enableNotifications"
              checked={data.enableNotifications}
              onChange={handleChange}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600"
            />
            <span className="text-gray-900 dark:text-white font-medium">
              Enable notifications
            </span>
          </label>
        </div>

        <div className="flex gap-3">
          <Button type="submit" isLoading={isLoading} variant="primary">
            Save Settings
          </Button>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}

