import { useCallback, useEffect, useState } from 'react'

export function useVehicleData(vehicleId: string, refetchInterval = 30000) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchVehicleData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await globalThis.fetch(`/api/vehicle/status?vehicleId=${vehicleId}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setLoading(false)
    }
  }, [vehicleId])

  useEffect(() => {
    const interval = setInterval(fetchVehicleData, refetchInterval)
    return () => clearInterval(interval)
  }, [fetchVehicleData, refetchInterval])

  return { data, loading, error, refetch: fetchVehicleData }
}

export function useTrips(range: '7d' | '30d' | '90d' | '1y' = '30d') {
  const [trips, setTrips] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const fetchTrips = async () => {
      try {
        setLoading(true)
        const res = await globalThis.fetch(`/api/trips?range=${range}`)
        if (!res.ok) throw new Error('Failed to fetch')
        const json = await res.json()
        setTrips(json.trips || [])
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Unknown error'))
      } finally {
        setLoading(false)
      }
    }

    void fetchTrips()
  }, [range])

  return { trips, loading, error }
}

export function useLocalStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = typeof window !== 'undefined' ? localStorage.getItem(key) : null
      return item ? JSON.parse(item) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const setStoredValue = (nextValue: T | ((current: T) => T)) => {
    try {
      const valueToStore = nextValue instanceof Function ? nextValue(value) : nextValue
      setValue(valueToStore)
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(valueToStore))
      }
    } catch (err) {
      console.error(err)
    }
  }

  return [value, setStoredValue] as const
}

export function usePagination<T>(items: T[], itemsPerPage = 10) {
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage))
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentItems = items.slice(startIndex, endIndex)

  return {
    currentPage,
    setCurrentPage,
    totalPages,
    currentItems,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1,
  }
}

export function useDebounce<T>(value: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}
